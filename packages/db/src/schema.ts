import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
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
  /** Prepaid credit balance. Only meaningful when billing is enabled. */
  credits: bigint("credits", { mode: "number" }).notNull().default(0),
  /** HMAC secret for webhooks sent to this account. */
  webhookSecret: text("webhook_secret").notNull().default(sql`encode(gen_random_bytes(24), 'hex')`),
  lowBalanceNotifiedAt: timestamp("low_balance_notified_at", { withTimezone: true }),
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

/* ------------------------------------------------------------------- api keys */

export const apiKeys = pgTable(
  "api_key",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** First characters of the key, safe to display. */
    prefix: text("prefix").notNull(),
    /** SHA-256 of the full key. The key itself is never stored. */
    hash: text("hash").notNull().unique(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("api_key_user_idx").on(t.userId)],
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
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
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
  (t) => [uniqueIndex("llm_credential_user_provider_uidx").on(t.userId, t.provider)],
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
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
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
  (t) => [index("user_proxy_user_idx").on(t.userId, t.tier)],
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
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    delta: bigint("delta", { mode: "number" }).notNull(),
    reason: ledgerReasonEnum("reason").notNull(),
    /** External id (e.g. Polar order id). Unique so webhooks are idempotent. */
    reference: text("reference").unique(),
    amountUsdCents: integer("amount_usd_cents"),
    createdAt: createdAt(),
  },
  (t) => [index("credit_ledger_user_idx").on(t.userId, t.createdAt)],
);

export const usageEvents = pgTable(
  "usage_event",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
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
  (t) => [index("usage_event_user_time_idx").on(t.userId, t.createdAt.desc())],
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
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
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
  (t) => [index("crawl_user_idx").on(t.userId, t.createdAt.desc())],
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
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
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
    index("monitor_user_idx").on(t.userId, t.createdAt.desc()),
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
