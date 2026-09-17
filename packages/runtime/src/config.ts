import { z } from "zod";

const bool = (def: boolean) =>
  z
    .enum(["true", "false", "1", "0", ""])
    .optional()
    .transform((v) => (v === undefined || v === "" ? def : v === "true" || v === "1"));

const optional = z
  .string()
  .optional()
  .transform((v) => (v?.trim() ? v.trim() : undefined));

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),

  PUBLIC_API_URL: z.url().default("http://localhost:8080"),
  PUBLIC_WEB_URL: z.url().default("http://localhost:3000"),

  DATABASE_URL: z.string().min(1),
  DATABASE_POOL_SIZE: z.coerce.number().int().min(1).max(200).default(10),
  /** Queue Redis. Must use `maxmemory-policy noeviction`. */
  REDIS_URL: z.string().min(1),
  /** Cache/rate-limit Redis. Should use `allkeys-lru`. Defaults to REDIS_URL. */
  CACHE_REDIS_URL: optional,

  /** 32+ char secret used to encrypt stored provider keys. */
  PLUCK_ENCRYPTION_KEY: z.string().min(32),

  BILLING_ENABLED: bool(false),
  ALLOW_PRIVATE_NETWORK: bool(false),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(0).default(0),
  /** Self-host convenience: this key is valid for an auto-created owner account. */
  BOOTSTRAP_API_KEY: optional,

  S3_ENDPOINT: optional,
  S3_REGION: z.string().default("auto"),
  S3_BUCKET: optional,
  S3_ACCESS_KEY_ID: optional,
  S3_SECRET_ACCESS_KEY: optional,
  /** Public base URL objects are served from, e.g. https://pluck-cdn.procd.cc */
  STORAGE_PUBLIC_URL: optional,

  PROXY_DATACENTER_URLS: optional,
  PROXY_RESIDENTIAL_URLS: optional,

  SEARCH_PROVIDERS: optional,
  SEARXNG_URL: optional,
  BRAVE_API_KEY: optional,
  SERPER_API_KEY: optional,

  PLUCK_LLM_PROVIDER: optional,
  PLUCK_LLM_API_KEY: optional,
  PLUCK_LLM_MODEL: optional,
  PLUCK_LLM_BASE_URL: optional,
  OPENROUTER_API_KEY: optional,
  LLM_MAX_INPUT_CHARS: z.coerce.number().int().min(1_000).default(120_000),
  LLM_TIMEOUT_MS: z.coerce.number().int().min(1_000).default(90_000),

  POLAR_ACCESS_TOKEN: optional,
  POLAR_WEBHOOK_SECRET: optional,
  POLAR_SERVER: z.enum(["production", "sandbox"]).default("production"),

  SES_REGION: optional,
  SES_ACCESS_KEY_ID: optional,
  SES_SECRET_ACCESS_KEY: optional,
  EMAIL_FROM: optional,
  CONTACT_EMAIL: optional,

  BROWSER_CONCURRENCY: z.coerce.number().int().min(1).max(64).default(4),
  CRAWL_CONCURRENCY: z.coerce.number().int().min(1).max(64).default(4),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid configuration:\n${issues}`);
  }
  return parsed.data;
}
