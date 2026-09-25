import "server-only";
import { createHmac } from "node:crypto";
import postgres from "postgres";
import { db } from "@/lib/db";

/**
 * Runs one SQL statement for the admin panel, as safely as a raw editor can:
 *
 * - its own small pool, so a slow query never starves the app's connections;
 * - one statement per run (the extended protocol refuses more), which also
 *   means nobody can smuggle a COMMIT past the wrapping transaction;
 * - read-only by default, enforced by Postgres (`BEGIN READ ONLY`), not by us;
 * - writes run first as a preview that is rolled back, and commit only when
 *   asked to explicitly;
 * - statement, lock and idle timeouts on every run;
 * - it logs in as pluck_admin_sql (migration 0001), a role that
 *   can only read and write rows, so Postgres refuses files, programs, other
 *   databases, DDL, TRUNCATE and edits to the admin audit trail; the pattern
 *   checks here are a second line and a clearer error message;
 * - at most 1,000 rows come back, read through a cursor so a huge table is
 *   never pulled into memory.
 */

export type SqlMode = "read" | "preview" | "commit";

export interface SqlResult {
  ok: true;
  mode: SqlMode;
  command: string;
  columns: string[];
  rows: unknown[][];
  rowCount: number;
  truncated: boolean;
  durationMs: number;
  committed: boolean;
}

export interface SqlError {
  ok: false;
  error: string;
  position?: number;
  durationMs: number;
}

export const MAX_ROWS = 1000;
const MAX_CELL = 10_000;

const ROLE = "pluck_admin_sql";
const globalForSql = globalThis as unknown as { pluckAdminSql?: Promise<postgres.Sql> };

/**
 * The editor logs in as pluck_admin_sql itself. Switching to it from the
 * app's superuser session would not be enough: Postgres checks role changes
 * against the login user, so set_config('role', ...) could switch straight
 * back. Its password is derived from the app secret, never stored, and set
 * here (idempotently) by the app's own connection before the pool opens.
 */
function client() {
  globalForSql.pluckAdminSql ??= (async () => {
    const secret = process.env.BETTER_AUTH_SECRET;
    const url = process.env.DATABASE_URL;
    if (!secret || !url) throw new Error("The editor needs DATABASE_URL and BETTER_AUTH_SECRET.");
    const password = createHmac("sha256", secret).update(ROLE).digest("base64url");
    await db.$client.unsafe(
      `alter role ${ROLE} with login noinherit connection limit 4 password '${password}'`,
    );
    const target = new URL(url);
    target.username = ROLE;
    target.password = password;
    return postgres(target.toString(), {
      max: 2,
      idle_timeout: 60,
      connect_timeout: 10,
      prepare: false,
      onnotice: () => {},
    });
  })().catch((err) => {
    globalForSql.pluckAdminSql = undefined;
    throw err;
  });
  return globalForSql.pluckAdminSql;
}

/** Strips comments and string literals, so the checks below see only SQL. */
function skeleton(query: string) {
  return (
    query
      .replace(/--[^\n]*/g, " ")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/\$([A-Za-z_]*)\$[\s\S]*?\$\1\$/g, "''")
      .replace(/'(?:[^']|'')*'/g, "''")
      // Quoted identifiers keep their text: "pg_read_file"(...) is still a call.
      .replace(/"((?:[^"]|"")*)"/g, " $1 ")
  );
}

const FIRST_WORD_BLOCKED = new Set([
  "begin",
  "start",
  "commit",
  "end",
  "rollback",
  "abort",
  "savepoint",
  "release",
  "prepare",
  "set",
  "reset",
  "discard",
  "copy",
  "vacuum",
  "checkpoint",
  "load",
  "listen",
  "unlisten",
]);

const DENY: [RegExp, string][] = [
  [
    /\b(pg_read_file|pg_read_binary_file|pg_ls_dir|pg_stat_file|pg_ls_\w+dir|lo_import|lo_export|lo_from_bytea|pg_file_write)\b/i,
    "Reading or writing server files is not allowed here.",
  ],
  [/\b(dblink\w*|postgres_fdw)\b/i, "Connecting to other databases is not allowed here."],
  [
    /\b(pg_terminate_backend|pg_cancel_backend|pg_reload_conf|pg_rotate_logfile|pg_promote)\b/i,
    "Server control functions are not allowed here.",
  ],
  [/\bset_config\b/i, "Changing session settings is not allowed here."],
  [
    /\bpg_advisory_lock\w*\b|\bpg_try_advisory_lock\b/i,
    "Session-level locks are not allowed here.",
  ],
  [/\balter\s+system\b/i, "ALTER SYSTEM is not allowed here."],
  [
    /\b(create|alter|drop)\s+(database|role|user|group|extension|tablespace|server|subscription|publication|foreign\s+data\s+wrapper|event\s+trigger|language)\b/i,
    "Databases, roles, extensions and servers are managed outside the panel.",
  ],
  [/\b(grant|revoke)\b/i, "Permissions are managed outside the panel."],
  [/\bcopy\b[\s\S]*\bprogram\b/i, "COPY ... PROGRAM is not allowed here."],
];

const ROW_KEYWORDS = new Set(["select", "with", "table", "values", "show", "explain"]);

/** Why a statement is refused, or null when it may run. */
export function refusal(query: string): string | null {
  const bare = skeleton(query).trim().replace(/;\s*$/, "");
  if (!bare) return "Write a statement first.";
  if (bare.includes(";")) return "Run one statement at a time: select the one you want and run it.";
  const first = bare.match(/^[(\s]*([a-z_]+)/i)?.[1]?.toLowerCase() ?? "";
  if (FIRST_WORD_BLOCKED.has(first))
    return `${first.toUpperCase()} is not allowed: the panel manages transactions and settings itself.`;
  for (const [pattern, message] of DENY) if (pattern.test(bare)) return message;
  return null;
}

function cell(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (Buffer.isBuffer(value)) {
    const hex = value.subarray(0, 64).toString("hex");
    return `\\x${hex}${value.length > 64 ? `… (${value.length} bytes)` : ""}`;
  }
  if (typeof value === "string" && value.length > MAX_CELL)
    return `${value.slice(0, MAX_CELL)}… (${value.length} characters)`;
  if (typeof value === "object") {
    const json = JSON.stringify(value);
    return json.length > MAX_CELL ? `${json.slice(0, MAX_CELL)}…` : value;
  }
  return value;
}

class Rollback extends Error {}

export async function runSql(query: string, mode: SqlMode): Promise<SqlResult | SqlError> {
  const started = performance.now();
  const took = () => Math.round(performance.now() - started);
  const refused = refusal(query);
  if (refused) return { ok: false, error: refused, durationMs: 0 };

  const text = query.trim().replace(/;\s*$/, "");
  const first =
    skeleton(text)
      .trim()
      .match(/^[(\s]*([a-z_]+)/i)?.[1]
      ?.toLowerCase() ?? "";
  let result: SqlResult | null = null;

  try {
    const pool = await client();
    await pool.begin(mode === "read" ? "read only" : "read write", async (tx) => {
      await tx.unsafe("set local statement_timeout = '15s'");
      await tx.unsafe("set local lock_timeout = '3s'");
      await tx.unsafe("set local idle_in_transaction_session_timeout = '20s'");

      const rows: Record<string, unknown>[] = [];
      let truncated = false;
      let command = first.toUpperCase();
      let rowCount = 0;

      if (ROW_KEYWORDS.has(first)) {
        for await (const batch of tx.unsafe(text).cursor(250)) {
          for (const row of batch) {
            if (rows.length >= MAX_ROWS) {
              truncated = true;
              break;
            }
            rows.push(row);
          }
          if (truncated) break;
        }
        rowCount = rows.length;
      } else {
        const res = await tx.unsafe(text);
        command = res.command ?? command;
        rowCount = res.count ?? res.length;
        for (const row of res.slice(0, MAX_ROWS)) rows.push(row);
        truncated = res.length > MAX_ROWS;
      }

      const columns = rows[0] ? Object.keys(rows[0]) : [];
      result = {
        ok: true,
        mode,
        command,
        columns,
        rows: rows.map((r) => columns.map((c) => cell(r[c]))),
        rowCount,
        truncated,
        durationMs: took(),
        committed: mode === "commit",
      };
      if (mode !== "commit") throw new Rollback();
    });
  } catch (err) {
    if (!(err instanceof Rollback)) {
      const e = err as { message?: string; position?: string | number };
      const missingRole =
        /role "pluck_admin_sql" does not exist|must have CREATEROLE|permission denied to alter role/.test(
          e.message ?? "",
        );
      return {
        ok: false,
        error: missingRole
          ? "The editor is disabled: the database role pluck_admin_sql is missing. Run the migrations as a user that can create roles."
          : (e.message ?? "The query failed."),
        position: e.position ? Number(e.position) : undefined,
        durationMs: took(),
      };
    }
  }
  return result ?? { ok: false, error: "The query returned nothing.", durationMs: took() };
}

/** Tables and their columns, for the schema list and autocompletion. */
export async function schemaCatalog() {
  // Awaited first: a tagged template on an awaited expression compiles wrongly.
  const pool = await client();
  const rows = await pool<{ table: string; column: string; type: string; rows: number | null }[]>`
    select c.relname as table, a.attname as column,
           format_type(a.atttypid, a.atttypmod) as type,
           coalesce(st.n_live_tup, greatest(c.reltuples, 0))::bigint as rows
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    left join pg_stat_user_tables st on st.relid = c.oid
    where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p')
    order by c.relname, a.attnum`;
  const tables = new Map<
    string,
    { name: string; rows: number; columns: { name: string; type: string }[] }
  >();
  for (const r of rows) {
    const t = tables.get(r.table) ?? { name: r.table, rows: Number(r.rows ?? 0), columns: [] };
    t.columns.push({ name: r.column, type: r.type });
    tables.set(r.table, t);
  }
  return [...tables.values()];
}
