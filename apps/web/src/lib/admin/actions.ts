"use server";

import { adminSessions, apiKeys, creditLedger, newId, organizations, sessions } from "@pluck/db";
import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  audit,
  CHALLENGE_COOKIE,
  finishSignIn,
  requireAdmin,
  signOutAdmin,
  startSignIn,
} from "@/lib/admin/auth";
import {
  refusal,
  runSql,
  type SqlError,
  type SqlMode,
  type SqlResult,
  schemaCatalog,
} from "@/lib/admin/sql";
import { db } from "@/lib/db";

/**
 * Every action here re-checks the admin session itself: server actions are
 * public endpoints, so a guarded page in front of them protects nothing.
 */

export interface AdminState {
  ok?: string;
  error?: string;
}

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

export async function signInAction(_: AdminState, form: FormData): Promise<AdminState> {
  const result = await startSignIn(text(form, "username"), String(form.get("password") ?? ""));
  if (result.error) return { error: result.error };
  redirect("/admin/login");
}

export async function verifyAction(_: AdminState, form: FormData): Promise<AdminState> {
  const result = await finishSignIn(text(form, "code"));
  if (result.error) return { error: result.error };
  redirect("/admin");
}

export async function restartSignInAction() {
  (await cookies()).delete({ name: CHALLENGE_COOKIE, path: "/admin" });
  redirect("/admin/login");
}

export async function signOutAction() {
  await signOutAdmin();
  redirect("/admin/login");
}

export async function adjustCreditsAction(_: AdminState, form: FormData): Promise<AdminState> {
  const session = await requireAdmin();
  const orgId = text(form, "orgId");
  const delta = Math.trunc(Number(text(form, "delta")));
  const note = text(form, "note").slice(0, 200);
  if (!orgId) return { error: "Choose a workspace." };
  if (!Number.isFinite(delta) || delta === 0)
    return { error: "Enter a whole number of credits, like 500 or -200." };
  if (Math.abs(delta) > 10_000_000)
    return { error: "That is more than 10 million credits at once." };
  if (note.length < 3) return { error: "Say why, in a few words. It goes in the audit log." };

  const reference = `admin:${newId("adj")}`;
  const updated = await db.transaction(async (tx) => {
    const [org] = await tx
      .update(organizations)
      .set({ credits: sql`${organizations.credits} + ${delta}` })
      .where(eq(organizations.id, orgId))
      .returning({ credits: organizations.credits, name: organizations.name });
    if (!org) return null;
    await tx.insert(creditLedger).values({ orgId, delta, reason: "adjustment", reference });
    return org;
  });
  if (!updated) return { error: "That workspace no longer exists." };

  await audit(
    "credits_adjusted",
    { orgId, delta, note, reference, balance: updated.credits },
    session.id,
  );
  revalidatePath(`/admin/workspaces/${orgId}`);
  revalidatePath("/admin");
  return {
    ok: `${delta > 0 ? "Added" : "Removed"} ${Math.abs(delta).toLocaleString("en-US")} credits. ${updated.name} now has ${updated.credits.toLocaleString("en-US")}.`,
  };
}

export async function revokeKeyAction(form: FormData) {
  const session = await requireAdmin();
  const keyId = text(form, "keyId");
  const orgId = text(form, "orgId");
  const [key] = await db
    .update(apiKeys)
    .set({ revokedAt: sql`now()` })
    .where(and(eq(apiKeys.id, keyId), isNull(apiKeys.revokedAt)))
    .returning({ id: apiKeys.id, name: apiKeys.name });
  if (key) await audit("api_key_revoked", { keyId, orgId, name: key.name }, session.id);
  revalidatePath(`/admin/workspaces/${orgId}`);
}

export async function signOutUserAction(form: FormData) {
  const session = await requireAdmin();
  const userId = text(form, "userId");
  const removed = await db
    .delete(sessions)
    .where(eq(sessions.userId, userId))
    .returning({ id: sessions.id });
  await audit("user_signed_out", { userId, sessions: removed.length }, session.id);
  revalidatePath("/admin/users");
}

export async function revokeAdminSessionAction(form: FormData) {
  const session = await requireAdmin();
  const id = text(form, "sessionId");
  await db
    .update(adminSessions)
    .set({ revokedAt: sql`now()` })
    .where(and(eq(adminSessions.id, id), isNull(adminSessions.revokedAt)));
  await audit("admin_session_revoked", { sessionId: id }, session.id);
  if (id === session.id) redirect("/admin/login");
  revalidatePath("/admin/security");
}

export async function revokeOtherAdminSessionsAction() {
  const session = await requireAdmin();
  const revoked = await db
    .update(adminSessions)
    .set({ revokedAt: sql`now()` })
    .where(and(ne(adminSessions.id, session.id), isNull(adminSessions.revokedAt)))
    .returning({ id: adminSessions.id });
  await audit("admin_sessions_revoked", { count: revoked.length }, session.id);
  revalidatePath("/admin/security");
}

/** The SQL editor. Writes need writes switched on, and a commit needs "COMMIT" typed. */
export async function runSqlAction(input: {
  query: string;
  mode: SqlMode;
  confirm?: string;
}): Promise<SqlResult | SqlError> {
  const session = await requireAdmin();
  const query = String(input.query ?? "").slice(0, 50_000);
  const mode: SqlMode = input.mode === "preview" || input.mode === "commit" ? input.mode : "read";
  if (mode === "commit" && input.confirm !== "COMMIT")
    return { ok: false, error: "Type COMMIT to confirm the change.", durationMs: 0 };

  const refused = refusal(query);
  const result = refused
    ? ({ ok: false, error: refused, durationMs: 0 } as SqlError)
    : await runSql(query, mode);
  await audit(
    mode === "commit" ? "sql_commit" : mode === "preview" ? "sql_preview" : "sql_read",
    {
      query: query.slice(0, 5000),
      ok: result.ok,
      rows: result.ok ? result.rowCount : undefined,
      command: result.ok ? result.command : undefined,
      error: result.ok ? undefined : result.error.slice(0, 300),
      ms: result.durationMs,
    },
    session.id,
  );
  return result;
}

export async function schemaAction() {
  await requireAdmin();
  try {
    return { ok: true as const, tables: await schemaCatalog() };
  } catch (err) {
    return { ok: false as const, error: (err as Error).message };
  }
}
