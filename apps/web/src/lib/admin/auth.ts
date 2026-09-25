import "server-only";
import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { adminAudit, adminChallenges, adminSessions, newId } from "@pluck/db";
import { and, count, eq, gt, isNull, sql } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { escapeHtml, sendTelegram } from "@/lib/admin/telegram";
import { db } from "@/lib/db";

/**
 * The operator panel's own sign-in, separate from GitHub accounts:
 *
 *   1. username and password, compared against ADMIN_USERNAME and the scrypt
 *      hash in ADMIN_PASSWORD_HASH (`node scripts/admin-password.mjs`);
 *   2. a six-digit code sent to the operator's Telegram chat, valid for five
 *      minutes and five tries;
 *   3. a session cookie scoped to /admin: httpOnly, SameSite=Strict, twelve
 *      hours at most and one hour idle, stored only as a hash.
 *
 * Every step is rate limited per IP and in total, and written to admin_audit.
 * With either variable unset the whole panel answers 404.
 */

export const SESSION_COOKIE = "pluck-admin";
export const CHALLENGE_COOKIE = "pluck-admin-challenge";
const SESSION_HOURS = 12;
const IDLE_MINUTES = 60;
const CODE_MINUTES = 5;
const CODE_TRIES = 5;
const WINDOW = sql`now() - interval '15 minutes'`;

export function adminEnabled() {
  return Boolean(
    process.env.ADMIN_USERNAME &&
      process.env.ADMIN_PASSWORD_HASH &&
      process.env.TELEGRAM_BOT_TOKEN &&
      process.env.TELEGRAM_CHAT_ID,
  );
}

/** 404 rather than a login form when the panel is not configured. */
export function assertEnabled() {
  if (!adminEnabled()) notFound();
}

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

function sameText(a: string, b: string) {
  const x = createHash("sha256").update(a).digest();
  const y = createHash("sha256").update(b).digest();
  return timingSafeEqual(x, y);
}

/** `scrypt:N:r:p:salt:hash`, both base64, as written by scripts/admin-password.mjs. */
function passwordMatches(password: string) {
  const stored = process.env.ADMIN_PASSWORD_HASH ?? "";
  const [kind, n, r, p, salt, hash] = stored.split(":");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = scryptSync(password, Buffer.from(salt, "base64"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: 128 * 1024 * 1024,
  });
  return timingSafeEqual(actual, expected);
}

const codeHash = (challengeId: string, code: string) =>
  createHmac("sha256", process.env.BETTER_AUTH_SECRET ?? process.env.ADMIN_PASSWORD_HASH ?? "")
    .update(`${challengeId}:${code}`)
    .digest("hex");

export async function clientInfo() {
  const h = await headers();
  const ip =
    h.get("cf-connecting-ip") ??
    h.get("x-real-ip") ??
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    null;
  return { ip, userAgent: h.get("user-agent")?.slice(0, 300) ?? null };
}

export async function audit(
  action: string,
  detail: Record<string, unknown> | null = null,
  sessionId: string | null = null,
) {
  const { ip } = await clientInfo();
  await db.insert(adminAudit).values({ action, detail, ip, sessionId });
}

async function recent(action: string, ip: string | null) {
  const [row] = await db
    .select({ n: count() })
    .from(adminAudit)
    .where(
      and(
        eq(adminAudit.action, action),
        ip ? eq(adminAudit.ip, ip) : sql`true`,
        gt(adminAudit.createdAt, WINDOW),
      ),
    );
  return row?.n ?? 0;
}

const cookieBase = {
  httpOnly: true,
  sameSite: "strict" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/admin",
};

export type LoginResult = { error?: string };

/** Step one. The same answer for a wrong username and a wrong password. */
export async function startSignIn(username: string, password: string): Promise<LoginResult> {
  assertEnabled();
  const { ip, userAgent } = await clientInfo();

  if ((await recent("login_failed", ip)) >= 5 || (await recent("login_failed", null)) >= 30)
    return { error: "Too many attempts. Try again in 15 minutes." };
  if ((await recent("code_sent", ip)) >= 5)
    return { error: "Too many codes requested. Try again in 15 minutes." };

  // Always run scrypt, so a wrong username takes as long as a wrong password.
  const passwordOk = passwordMatches(password);
  const userOk = sameText(username, process.env.ADMIN_USERNAME ?? "");
  if (!passwordOk || !userOk) {
    await audit("login_failed", { username: username.slice(0, 64) });
    if ((await recent("login_failed", ip)) === 5)
      await sendTelegram(
        `⚠️ Pluck admin: 5 failed sign-ins from ${escapeHtml(ip ?? "an unknown IP")} in 15 minutes. That IP is locked out for now.`,
      ).catch(() => {});
    return { error: "That username and password do not match." };
  }

  const id = newId("adc");
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.insert(adminChallenges).values({
    id,
    codeHash: codeHash(id, code),
    ip,
    userAgent,
    expiresAt: sql`now() + interval '${sql.raw(String(CODE_MINUTES))} minutes'`,
  });
  try {
    await sendTelegram(
      [
        `🔐 Pluck admin sign-in code: <code>${code}</code>`,
        `Expires in ${CODE_MINUTES} minutes.`,
        `IP: ${escapeHtml(ip ?? "unknown")}`,
        `Browser: ${escapeHtml((userAgent ?? "unknown").slice(0, 120))}`,
        "If this was not you, change ADMIN_PASSWORD_HASH now.",
      ].join("\n"),
    );
  } catch {
    await audit("code_send_failed");
    return { error: "The code could not be sent to Telegram. Check the bot settings." };
  }
  await audit("code_sent");

  (await cookies()).set(CHALLENGE_COOKIE, id, { ...cookieBase, maxAge: CODE_MINUTES * 60 });
  return {};
}

export async function pendingChallenge() {
  const id = (await cookies()).get(CHALLENGE_COOKIE)?.value;
  if (!id) return null;
  const [row] = await db
    .select({ id: adminChallenges.id, expiresAt: adminChallenges.expiresAt })
    .from(adminChallenges)
    .where(
      and(
        eq(adminChallenges.id, id),
        isNull(adminChallenges.consumedAt),
        gt(adminChallenges.expiresAt, sql`now()`),
      ),
    );
  return row ?? null;
}

/** Step two: the code from Telegram. Success opens a session. */
export async function finishSignIn(code: string): Promise<LoginResult> {
  assertEnabled();
  const jar = await cookies();
  const id = jar.get(CHALLENGE_COOKIE)?.value;
  if (!id) return { error: "Start again: your sign-in expired." };

  // Count the try first, atomically, so parallel guesses cannot skip the limit.
  const [challenge] = await db
    .update(adminChallenges)
    .set({ attempts: sql`${adminChallenges.attempts} + 1` })
    .where(
      and(
        eq(adminChallenges.id, id),
        isNull(adminChallenges.consumedAt),
        gt(adminChallenges.expiresAt, sql`now()`),
      ),
    )
    .returning();
  if (!challenge || challenge.attempts > CODE_TRIES) {
    jar.delete({ name: CHALLENGE_COOKIE, path: "/admin" });
    await audit("code_failed", { reason: challenge ? "too_many_tries" : "expired" });
    return { error: "That code has expired. Start again." };
  }
  const clean = code.replace(/\D/g, "");
  if (clean.length !== 6 || !sameText(codeHash(id, clean), challenge.codeHash)) {
    await audit("code_failed", { attempt: challenge.attempts });
    const left = CODE_TRIES - challenge.attempts;
    return {
      error:
        left > 0
          ? `Wrong code. ${left} ${left === 1 ? "try" : "tries"} left.`
          : "Wrong code. Start again.",
    };
  }

  const consumed = await db
    .update(adminChallenges)
    .set({ consumedAt: sql`now()` })
    .where(and(eq(adminChallenges.id, id), isNull(adminChallenges.consumedAt)))
    .returning({ id: adminChallenges.id });
  if (consumed.length === 0) return { error: "That code was already used. Start again." };

  const { ip, userAgent } = await clientInfo();
  const token = randomBytes(32).toString("base64url");
  const sessionId = newId("ads");
  await db.insert(adminSessions).values({
    id: sessionId,
    tokenHash: sha256(token),
    ip,
    userAgent,
    expiresAt: sql`now() + interval '${sql.raw(String(SESSION_HOURS))} hours'`,
  });
  jar.delete({ name: CHALLENGE_COOKIE, path: "/admin" });
  jar.set(SESSION_COOKIE, token, { ...cookieBase, maxAge: SESSION_HOURS * 3600 });
  await audit("login", null, sessionId);
  await sendTelegram(`✅ Pluck admin: signed in from ${escapeHtml(ip ?? "an unknown IP")}.`).catch(
    () => {},
  );
  return {};
}

export interface AdminSession {
  id: string;
  ip: string | null;
  createdAt: Date;
  expiresAt: Date;
}

/**
 * The current admin session, or null. Memoised per request; every page,
 * action and route handler in the panel calls requireAdmin(), not just the
 * layout, because server actions can be invoked directly.
 */
export const currentAdmin = cache(async (): Promise<AdminSession | null> => {
  if (!adminEnabled()) return null;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const [row] = await db
    .update(adminSessions)
    .set({ lastSeenAt: sql`now()` })
    .where(
      and(
        eq(adminSessions.tokenHash, sha256(token)),
        isNull(adminSessions.revokedAt),
        gt(adminSessions.expiresAt, sql`now()`),
        gt(
          adminSessions.lastSeenAt,
          sql`now() - interval '${sql.raw(String(IDLE_MINUTES))} minutes'`,
        ),
      ),
    )
    .returning({
      id: adminSessions.id,
      ip: adminSessions.ip,
      createdAt: adminSessions.createdAt,
      expiresAt: adminSessions.expiresAt,
    });
  return row ?? null;
});

export async function requireAdmin(): Promise<AdminSession> {
  assertEnabled();
  const session = await currentAdmin();
  if (!session) redirect("/admin/login");
  return session;
}

export async function signOutAdmin() {
  const session = await currentAdmin();
  const jar = await cookies();
  if (session) {
    await db
      .update(adminSessions)
      .set({ revokedAt: sql`now()` })
      .where(eq(adminSessions.id, session.id));
    await audit("logout", null, session.id);
  }
  jar.delete({ name: SESSION_COOKIE, path: "/admin" });
}
