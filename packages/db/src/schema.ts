import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/* -------------------------------------------------------------- auth (Better Auth) */

export const users = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: text("role").notNull().default("user"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sessions = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const accounts = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("account_user_idx").on(t.userId),
    uniqueIndex("account_provider_uidx").on(t.providerId, t.accountId),
  ],
);

export const verifications = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Raw bytes; Postgres `bytea`. */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

/**
 * A profile picture someone uploaded. Kept in the database rather than object
 * storage so self-hosted instances need nothing extra; after re-encoding it
 * is a 256px WebP of a few kilobytes.
 */
export const userAvatars = pgTable("user_avatar", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  data: bytea("data").notNull(),
  contentType: text("content_type").notNull(),
  /** Content hash; also the cache-busting version in the avatar URL. */
  hash: text("hash").notNull(),
  /** The picture before the first upload (the GitHub one), restored on removal. */
  previousImage: text("previous_image"),
  updatedAt: updatedAt(),
});

/* -------------------------------------------------------------- organizations */

/**
 * A workspace: the account that owns everything: keys, credits, usage,
 * crawls, monitors, webhooks and credentials. People belong to workspaces
 * through `member`; every user names their first one when they sign up.
 */
export const organizations = pgTable("organization", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  /** The workspace picture's URL, when one has been uploaded. */
  image: text("image"),
  /** Prepaid credit balance. Only meaningful when billing is enabled. */
  credits: bigint("credits", { mode: "number" }).notNull().default(0),
  /** HMAC secret for webhooks sent from this workspace. */
  webhookSecret: text("webhook_secret").notNull().default(sql`encode(gen_random_bytes(24), 'hex')`),
  lowBalanceNotifiedAt: timestamp("low_balance_notified_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** A workspace's uploaded picture; the same shape as a user's, deleted with the workspace. */
export const organizationAvatars = pgTable("organization_avatar", {
  orgId: text("org_id")
    .primaryKey()
    .references(() => organizations.id, { onDelete: "cascade" }),
  data: bytea("data").notNull(),
  contentType: text("content_type").notNull(),
  hash: text("hash").notNull(),
  updatedAt: updatedAt(),
});

export const memberRoleEnum = pgEnum("member_role", ["owner", "admin", "member"]);

export const members = pgTable(
  "member",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRoleEnum("role").notNull().default("member"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("member_org_user_uidx").on(t.orgId, t.userId),
    index("member_user_idx").on(t.userId),
  ],
);

/**
 * An invitation to join a workspace. Only a hash of the token is stored, so
 * a database leak cannot be turned into a way in, and it can only be
 * accepted by a signed-in user whose verified email matches.
 */
export const invitations = pgTable(
  "invitation",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Lowercased. */
    email: text("email").notNull(),
    role: memberRoleEnum("role").notNull().default("member"),
    tokenHash: text("token_hash").notNull().unique(),
    invitedBy: text("invited_by").references(() => users.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("invitation_org_idx").on(t.orgId, t.createdAt.desc())],
);

/* ------------------------------------------------------------------- api keys */

export const apiKeys = pgTable(
  "api_key",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** The member who created it; kept when they leave, so the key's history is not lost. */
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    /** First characters of the key, safe to display. */
    prefix: text("prefix").notNull(),
    /** SHA-256 of the full key. The key itself is never stored. */
    hash: text("hash").notNull().unique(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("api_key_org_idx").on(t.orgId)],
);

export const llmProviderEnum = pgEnum("llm_provider", [
  "openrouter",
  "openai",
  "anthropic",
  "google",
  "groq",
  "openai-compatible",
]);

export const llmCredentials = pgTable(
  "llm_credential",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    provider: llmProviderEnum("provider").notNull(),
    /** AES-256-GCM ciphertext (iv:tag:data, base64). */
    encryptedKey: text("encrypted_key").notNull(),
    keyHint: text("key_hint").notNull(),
    model: text("model"),
    baseUrl: text("base_url"),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("llm_credential_org_provider_uidx").on(t.orgId, t.provider)],
);

export const proxyTierEnum = pgEnum("proxy_tier", ["datacenter", "residential"]);

/**
 * Egress proxies belonging to one account. Instance-wide proxies still come
 * from the environment; these are tried first for their owner's requests, so
 * bringing your own residential pool needs no redeploy.
 */
export const userProxies = pgTable(
  "user_proxy",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    tier: proxyTierEnum("tier").notNull(),
    /** AES-256-GCM ciphertext: the URL carries provider credentials. */
    encryptedUrl: text("encrypted_url").notNull(),
    /** `http://user:…@gw.provider.io:7777`, safe to show. */
    urlHint: text("url_hint").notNull(),
    active: boolean("active").notNull().default(true),
    /** Consecutive failures; a proxy that keeps failing is skipped. */
    failures: integer("failures").notNull().default(0),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("user_proxy_org_idx").on(t.orgId, t.tier)],
);

/* -------------------------------------------------------------------- billing */

export const ledgerReasonEnum = pgEnum("ledger_reason", [
  "signup",
  "purchase",
  "refund",
  "adjustment",
]);

/** Append-only record of every credit grant. Usage is tracked in `usage_event`. */
export const creditLedger = pgTable(
  "credit_ledger",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    delta: bigint("delta", { mode: "number" }).notNull(),
    reason: ledgerReasonEnum("reason").notNull(),
    /** External id (e.g. Polar order id). Unique so webhooks are idempotent. */
    reference: text("reference").unique(),
    amountUsdCents: integer("amount_usd_cents"),
    createdAt: createdAt(),
  },
  (t) => [index("credit_ledger_org_idx").on(t.orgId, t.createdAt)],
);

export const usageEvents = pgTable(
  "usage_event",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    apiKeyId: text("api_key_id"),
    requestId: text("request_id").notNull(),
    endpoint: text("endpoint").notNull(),
    status: smallint("status").notNull(),
    credits: integer("credits").notNull(),
    durationMs: integer("duration_ms").notNull(),
    cached: boolean("cached").notNull().default(false),
    target: text("target"),
    createdAt: createdAt(),
  },
  (t) => [index("usage_event_org_time_idx").on(t.orgId, t.createdAt.desc())],
);

/* ---------------------------------------------------------------------- crawl */

export const jobStatusEnum = pgEnum("job_status", [
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
]);

export const crawls = pgTable(
  "crawl",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    status: jobStatusEnum("status").notNull().default("queued"),
    url: text("url").notNull(),
    options: jsonb("options").notNull(),
    llm: jsonb("llm"),
    total: integer("total").notNull().default(0),
    completed: integer("completed").notNull().default(0),
    failed: integer("failed").notNull().default(0),
    creditsUsed: integer("credits_used").notNull().default(0),
    error: text("error"),
    createdAt: createdAt(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("crawl_org_idx").on(t.orgId, t.createdAt.desc())],
);

export const crawlPages = pgTable(
  "crawl_page",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    crawlId: text("crawl_id")
      .notNull()
      .references(() => crawls.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    depth: smallint("depth").notNull(),
    result: jsonb("result"),
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => [index("crawl_page_crawl_idx").on(t.crawlId, t.id)],
);

/* ------------------------------------------------------------------- monitors */

export const monitorTypeEnum = pgEnum("monitor_type", ["page", "sitemap", "extract"]);

export const monitors = pgTable(
  "monitor",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name"),
    type: monitorTypeEnum("type").notNull(),
    url: text("url").notNull(),
    intervalMinutes: integer("interval_minutes").notNull(),
    webhook: text("webhook"),
    selector: text("selector"),
    schema: jsonb("schema"),
    prompt: text("prompt"),
    proxy: text("proxy").notNull().default("auto"),
    active: boolean("active").notNull().default(true),
    snapshot: text("snapshot"),
    snapshotHash: text("snapshot_hash"),
    consecutiveFailures: smallint("consecutive_failures").notNull().default(0),
    lastError: text("last_error"),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    lastChangedAt: timestamp("last_changed_at", { withTimezone: true }),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("monitor_org_idx").on(t.orgId, t.createdAt.desc()),
    index("monitor_due_idx").on(t.nextRunAt).where(sql`${t.active}`),
  ],
);

export const monitorChanges = pgTable(
  "monitor_change",
  {
    id: text("id").primaryKey(),
    monitorId: text("monitor_id")
      .notNull()
      .references(() => monitors.id, { onDelete: "cascade" }),
    summary: text("summary"),
    diff: text("diff"),
    added: jsonb("added").$type<string[]>(),
    removed: jsonb("removed").$type<string[]>(),
    detectedAt: timestamp("detected_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("monitor_change_monitor_idx").on(t.monitorId, t.detectedAt.desc())],
);

/* ------------------------------------------------------------------- webhooks */

export const deliveryStatusEnum = pgEnum("delivery_status", ["pending", "succeeded", "failed"]);

/**
 * One row per webhook we send, updated on every attempt.
 *
 * Without it "your webhook never fired" has no answer: the queue forgets a job
 * once it finishes. The payload is kept so a delivery can be sent again after
 * the receiver is fixed.
 */
export const webhookDeliveries = pgTable(
  "webhook_delivery",
  {
    /** Also the queue job id, and sent to the receiver as the delivery id. */
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    event: text("event").notNull(),
    url: text("url").notNull(),
    payload: jsonb("payload").notNull(),
    status: deliveryStatusEnum("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    /** HTTP status of the most recent attempt, when the receiver answered at all. */
    lastStatus: integer("last_status"),
    lastError: text("last_error"),
    /** Milliseconds the most recent attempt took. */
    lastDurationMs: integer("last_duration_ms"),
    createdAt: createdAt(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  },
  (t) => [index("webhook_delivery_org_idx").on(t.orgId, t.createdAt.desc())],
);

/* --------------------------------------------------------------------- brands */

/** Shared brand profile cache, keyed by domain. Not user data. */
export const brands = pgTable("brand", {
  domain: text("domain").primaryKey(),
  data: jsonb("data").notNull(),
  updatedAt: updatedAt(),
});

/* -------------------------------------------------------------------- contact */

export const contactRequests = pgTable("contact_request", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  company: text("company"),
  volume: text("volume"),
  message: text("message").notNull(),
  userId: text("user_id"),
  createdAt: createdAt(),
});

/* ---------------------------------------------------------------------- admin */

/**
 * The operator panel at /admin. It has its own sign-in (a username and
 * password from the environment, then a TOTP code from an authenticator
 * app), separate from GitHub accounts, so a compromised user account can
 * never reach it.
 */

/** The enrolled authenticator. One row at most; removing it re-opens enrolment. */
export const adminTotp = pgTable("admin_totp", {
  id: text("id").primaryKey(),
  /** The base32 TOTP secret, sealed with PLUCK_ENCRYPTION_KEY. */
  secret: text("secret").notNull(),
  /** The last time step accepted, so no code can be used twice. */
  lastCounter: bigint("last_counter", { mode: "number" }).notNull().default(0),
  createdAt: createdAt(),
});

/** A sign-in in progress: the password was right, the TOTP code is pending. */
export const adminChallenges = pgTable("admin_challenge", {
  id: text("id").primaryKey(),
  /** First sign-in only: the sealed secret shown as a QR code, kept until confirmed. */
  enrollSecret: text("enroll_secret"),
  attempts: smallint("attempts").notNull().default(0),
  ip: text("ip"),
  userAgent: text("user_agent"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const adminSessions = pgTable("admin_session", {
  id: text("id").primaryKey(),
  /** SHA-256 of the cookie's token; the token itself is never stored. */
  tokenHash: text("token_hash").notNull().unique(),
  ip: text("ip"),
  userAgent: text("user_agent"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: createdAt(),
});

/** Everything done in the panel, sign-in attempts included. Append-only. */
export const adminAudit = pgTable(
  "admin_audit",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    sessionId: text("session_id"),
    action: text("action").notNull(),
    detail: jsonb("detail"),
    ip: text("ip"),
    createdAt: createdAt(),
  },
  (t) => [
    index("admin_audit_time_idx").on(t.createdAt.desc()),
    index("admin_audit_action_ip_idx").on(t.action, t.ip, t.createdAt),
  ],
);
