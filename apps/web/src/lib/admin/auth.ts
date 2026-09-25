import "server-only";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { SecretBox } from "@pluck/ai";
import { adminAudit, adminChallenges, adminSessions, adminTotp, newId } from "@pluck/db";
import { and, count, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Secret, TOTP } from "otpauth";
import QRCode from "qrcode";
import { cache } from "react";
import { escapeHtml, sendTelegram } from "@/lib/admin/telegram";
import { db } from "@/lib/db";

/**
 * The operator panel's own sign-in, separate from GitHub accounts:
 *
 *   1. username and password, compared against ADMIN_USERNAME and the scrypt
 *      hash in ADMIN_PASSWORD_HASH (`node scripts/admin-password.mjs`);
 *   2. a six-digit TOTP code from an authenticator app. The first sign-in
 *      shows a QR code to enrol one; after that the panel never shows the
 *      secret again, and enrolling anew needs the admin_totp row deleted
 *      directly in the database. Each code works once;
 *   3. a session cookie scoped to /admin: httpOnly, SameSite=Strict, twelve
 *      hours at most and one hour idle, stored only as a hash.
 *
 * Every step is rate limited per IP and in total, and written to admin_audit.
 * The TOTP secret is sealed with PLUCK_ENCRYPTION_KEY. With ADMIN_USERNAME,
 * ADMIN_PASSWORD_HASH or that key unset, the whole panel answers 404.
 * Telegram, when configured, only receives alerts.
 */

export const SESSION_COOKIE = "pluck-admin";
export const CHALLENGE_COOKIE = "pluck-admin-challenge";
const SESSION_HOURS = 12;
const IDLE_MINUTES = 60;
const CODE_MINUTES = 5;
const ENROL_MINUTES = 15;
const CODE_TRIES = 5;
const TOTP_ID = "primary";
const WINDOW = sql`now() - interval '15 minutes'`;

export function adminEnabled() {
  return Boolean(
    process.env.ADMIN_USERNAME &&
      process.env.ADMIN_PASSWORD_HASH &&
      (process.env.PLUCK_ENCRYPTION_KEY?.length ?? 0) >= 32,
  );
}

/** 404 rather than a login form when the panel is not configured. */
export function assertEnabled() {
  if (!adminEnabled()) notFound();
}

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const box = () => new SecretBox(process.env.PLUCK_ENCRYPTION_KEY ?? "");

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

/** Standard authenticator settings (SHA-1, 6 digits, 30 s), so every app works. */
const totpFor = (base32: string) =>
  new TOTP({
    issuer: "Pluck",
    label: process.env.ADMIN_USERNAME ?? "admin",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(base32),
  });

/** Security alerts to Telegram when it is configured; never blocks sign-in. */
const alert = (text: string) => {
  if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID)
    void sendTelegram(text).catch(() => {});
};

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

async function enrolled() {
  const [row] = await db.select().from(adminTotp).where(eq(adminTotp.id, TOTP_ID));
  return row ?? null;
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
  if ((await recent("password_ok", ip)) >= 10)
    return { error: "Too many sign-ins started. Try again in 15 minutes." };

  // Always run scrypt, so a wrong username takes as long as a wrong password.
  const passwordOk = passwordMatches(password);
  const userOk = sameText(username, process.env.ADMIN_USERNAME ?? "");
  if (!passwordOk || !userOk) {
    await audit("login_failed", { username: username.slice(0, 64) });
    if ((await recent("login_failed", ip)) === 5)
      alert(
        `⚠️ Pluck admin: 5 failed sign-ins from ${escapeHtml(ip ?? "an unknown IP")} in 15 minutes. That IP is locked out for now.`,
      );
    return { error: "That username and password do not match." };
  }

  // No authenticator yet: this sign-in enrols one, with a fresh secret.
  const enrolling = !(await enrolled());
  const id = newId("adc");
  const minutes = enrolling ? ENROL_MINUTES : CODE_MINUTES;
  await db.insert(adminChallenges).values({
    id,
    enrollSecret: enrolling ? box().seal(new Secret({ size: 20 }).base32) : null,
    ip,
    userAgent,
    expiresAt: sql`now() + interval '${sql.raw(String(minutes))} minutes'`,
  });
  await audit("password_ok", { enrolling });
  (await cookies()).set(CHALLENGE_COOKIE, id, { ...cookieBase, maxAge: minutes * 60 });
  return {};
}

export interface PendingChallenge {
  id: string;
  /** Present only on the first sign-in, to show once as a QR code. */
  enrol: { qr: string; secret: string } | null;
}

export async function pendingChallenge(): Promise<PendingChallenge | null> {
  const id = (await cookies()).get(CHALLENGE_COOKIE)?.value;
  if (!id) return null;
  const [row] = await db
    .select({ id: adminChallenges.id, enrollSecret: adminChallenges.enrollSecret })
    .from(adminChallenges)
    .where(
      and(
        eq(adminChallenges.id, id),
        isNull(adminChallenges.consumedAt),
        gt(adminChallenges.expiresAt, sql`now()`),
      ),
    );
  if (!row) return null;
  if (!row.enrollSecret) return { id: row.id, enrol: null };
  const secret = box().open(row.enrollSecret);
  const qr = await QRCode.toDataURL(totpFor(secret).toString(), {
    margin: 1,
    width: 240,
    errorCorrectionLevel: "M",
  });
  return { id: row.id, enrol: { qr, secret: secret.replace(/(.{4})/g, "$1 ").trim() } };
}

/**
 * The time step a code belongs to, if it is valid now (one step either side
 * allows for clock drift), or null.
 */
function stepFor(secret: string, code: string) {
  const totp = totpFor(secret);
  const delta = totp.validate({ token: code, window: 1 });
  return delta === null ? null : totp.counter() + delta;
}

/** Step two: the authenticator code. Success opens a session. */
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
    return { error: "This sign-in has expired. Start again." };
  }

  const clean = code.replace(/\D/g, "");
  const wrong = async () => {
    await audit("code_failed", { attempt: challenge.attempts });
    const left = CODE_TRIES - challenge.attempts;
    return {
      error:
        left > 0
          ? `That code is not right. ${left} ${left === 1 ? "try" : "tries"} left.`
          : "That code is not right. Start again.",
    };
  };
  if (clean.length !== 6) return wrong();

  if (challenge.enrollSecret) {
    // First sign-in: the code proves the app scanned the QR code correctly.
    const secret = box().open(challenge.enrollSecret);
    const step = stepFor(secret, clean);
    if (step === null) return wrong();
    const saved = await db
      .insert(adminTotp)
      .values({ id: TOTP_ID, secret: challenge.enrollSecret, lastCounter: step })
      .onConflictDoNothing()
      .returning({ id: adminTotp.id });
    if (saved.length === 0) {
      jar.delete({ name: CHALLENGE_COOKIE, path: "/admin" });
      return { error: "An authenticator was enrolled meanwhile. Start again and use that one." };
    }
    await audit("totp_enrolled");
    alert("🔐 Pluck admin: an authenticator app was enrolled. If this was not you, act now.");
  } else {
    const row = await enrolled();
    if (!row) {
      jar.delete({ name: CHALLENGE_COOKIE, path: "/admin" });
      return { error: "The authenticator was removed. Start again to enrol a new one." };
    }
    const step = stepFor(box().open(row.secret), clean);
    if (step === null) return wrong();
    // Each code once: only a step newer than the last accepted one counts.
    const moved = await db
      .update(adminTotp)
      .set({ lastCounter: step })
      .where(and(eq(adminTotp.id, TOTP_ID), lt(adminTotp.lastCounter, step)))
      .returning({ id: adminTotp.id });
    if (moved.length === 0) {
      await audit("code_failed", { attempt: challenge.attempts, reason: "reused" });
      return { error: "That code was already used. Wait for the next one." };
    }
  }

  const consumed = await db
    .update(adminChallenges)
    .set({ consumedAt: sql`now()`, enrollSecret: null })
    .where(and(eq(adminChallenges.id, id), isNull(adminChallenges.consumedAt)))
    .returning({ id: adminChallenges.id });
  if (consumed.length === 0) return { error: "This sign-in was already used. Start again." };

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
  alert(`✅ Pluck admin: signed in from ${escapeHtml(ip ?? "an unknown IP")}.`);
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
