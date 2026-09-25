import type { Metadata } from "next";
import Link from "next/link";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { Pager } from "@/components/admin/search-box";
import { Badge, Card, dateTime, Empty, PageTitle, Table } from "@/components/admin/ui";
import { revokeAdminSessionAction, revokeOtherAdminSessionsAction } from "@/lib/admin/actions";
import { requireAdmin } from "@/lib/admin/auth";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Security" };

const PER_PAGE = 50;
const FILTERS = [
  { key: "", label: "Everything" },
  { key: "sign-in", label: "Sign-ins" },
  { key: "sql", label: "SQL" },
  { key: "changes", label: "Changes" },
];

const TONE: Record<string, "good" | "bad" | "plain"> = {
  login: "good",
  login_failed: "bad",
  code_failed: "bad",
  totp_enrolled: "bad",
  sql_commit: "bad",
  credits_adjusted: "plain",
};

export default async function AdminSecurity({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; page?: string }>;
}) {
  const current = await requireAdmin();
  const params = await searchParams;
  const filter = FILTERS.some((f) => f.key === params.filter) ? (params.filter ?? "") : "";
  const page = Math.max(1, Number(params.page) || 1);
  const sql = db.$client;

  const where =
    filter === "sign-in"
      ? sql`action in ('login', 'logout', 'login_failed', 'password_ok', 'code_failed', 'totp_enrolled')`
      : filter === "sql"
        ? sql`action like 'sql_%'`
        : filter === "changes"
          ? sql`action not like 'sql_read' and action not in ('login', 'logout', 'login_failed', 'password_ok', 'code_failed', 'totp_enrolled')`
          : sql`true`;

  const [adminSessions, events] = await Promise.all([
    sql`select id, ip, user_agent, created_at, last_seen_at, expires_at from admin_session
        where revoked_at is null and expires_at > now() and last_seen_at > now() - interval '60 minutes'
        order by last_seen_at desc`,
    sql`select id, session_id, action, detail, ip, created_at from admin_audit where ${where}
        order by created_at desc limit ${PER_PAGE + 1} offset ${(page - 1) * PER_PAGE}`,
  ]);

  return (
    <>
      <PageTitle
        title="Security"
        description="Who is signed in to the panel, and everything done in it."
      />

      <Card
        title="Active admin sessions"
        flush
        action={
          adminSessions.length > 1 ? (
            <form action={revokeOtherAdminSessionsAction}>
              <button
                type="submit"
                className="cursor-pointer text-sm text-[var(--accent)] hover:underline"
              >
                Sign out all others
              </button>
            </form>
          ) : null
        }
      >
        <Table head={["Session", "IP", "Browser", "Signed in", "Last seen", ""]}>
          {adminSessions.map((s) => (
            <tr key={s.id}>
              <td className="mono whitespace-nowrap text-xs">
                {s.id}
                {s.id === current.id && (
                  <span className="ml-2">
                    <Badge tone="good">this one</Badge>
                  </span>
                )}
              </td>
              <td className="mono whitespace-nowrap text-xs">{s.ip ?? "unknown"}</td>
              <td className="max-w-[24rem] truncate text-xs text-[var(--ink-soft)]">
                {s.user_agent ?? "unknown"}
              </td>
              <td className="whitespace-nowrap text-[var(--ink-soft)]">
                {dateTime(s.created_at as Date)}
              </td>
              <td className="whitespace-nowrap text-[var(--ink-soft)]">
                {dateTime(s.last_seen_at as Date)}
              </td>
              <td className="text-right">
                <ConfirmButton
                  action={revokeAdminSessionAction}
                  fields={{ sessionId: String(s.id) }}
                  label={s.id === current.id ? "Sign out" : "Revoke"}
                  confirm="Tap again"
                />
              </td>
            </tr>
          ))}
        </Table>
      </Card>

      <div className="mt-6 mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl">Audit log</h2>
        <div className="flex border border-[var(--line)] bg-[var(--sheet)] p-0.5 text-sm">
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={f.key ? `/admin/security?filter=${f.key}` : "/admin/security"}
              className={`px-3 py-1.5 ${f.key === filter ? "bg-[var(--ink)] text-[var(--paper)]" : "text-[var(--ink-soft)] hover:text-[var(--ink)]"}`}
            >
              {f.label}
            </Link>
          ))}
        </div>
      </div>
      <Card
        title={`${FILTERS.find((f) => f.key === filter)?.label ?? "Everything"}, newest first`}
        flush
      >
        {events.length === 0 ? (
          <Empty>Nothing logged yet.</Empty>
        ) : (
          <Table head={["When", "Action", "Detail", "IP"]}>
            {events.slice(0, PER_PAGE).map((e) => {
              const detail = (e.detail ?? {}) as Record<string, unknown>;
              const query = typeof detail.query === "string" ? detail.query : null;
              const rest = Object.fromEntries(
                Object.entries(detail).filter(([k]) => k !== "query"),
              );
              return (
                <tr key={e.id} className="align-top">
                  <td className="whitespace-nowrap text-[var(--ink-soft)]">
                    {dateTime(e.created_at as Date)}
                  </td>
                  <td>
                    <Badge tone={TONE[e.action] ?? "plain"}>{e.action}</Badge>
                  </td>
                  <td className="min-w-72 text-xs">
                    {query && (
                      <details>
                        <summary className="mono cursor-pointer truncate text-[var(--ink)]">
                          {query.split("\n")[0]?.slice(0, 120)}
                        </summary>
                        <pre className="mono mt-2 overflow-x-auto whitespace-pre-wrap bg-[var(--paper)] p-2">
                          {query}
                        </pre>
                      </details>
                    )}
                    {Object.keys(rest).length > 0 && (
                      <span className="mono text-[var(--ink-soft)]">
                        {Object.entries(rest)
                          .filter(([, v]) => v !== undefined && v !== null)
                          .map(
                            ([k, v]) =>
                              `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`,
                          )
                          .join(" · ")}
                      </span>
                    )}
                  </td>
                  <td className="mono whitespace-nowrap text-xs text-[var(--ink-faint)]">
                    {e.ip ?? "unknown"}
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
      <Pager
        page={page}
        hasMore={events.length > PER_PAGE}
        base="/admin/security"
        params={{ filter }}
      />
    </>
  );
}
