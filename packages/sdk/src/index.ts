import type {
  EndpointId,
  EndpointInput,
  EndpointOutput,
  ErrorBody,
  ResponseMeta,
} from "@pluck/shared";

export type { EndpointInput, EndpointOutput, ResponseMeta };

/** Hosted instance. Self-hosters pass `baseUrl` or set PLUCK_API_URL. */
const DEFAULT_BASE_URL = "https://pluck-api.procd.cc";

export interface PluckOptions {
  apiKey?: string;
  baseUrl?: string;
  /** Bring your own LLM key for AI endpoints (never stored by Pluck). */
  llm?: { provider?: string; apiKey?: string; model?: string; baseUrl?: string };
  timeoutMs?: number;
  maxRetries?: number;
  fetch?: typeof fetch;
}

export class PluckApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId?: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "PluckApiError";
  }
}

type Method = "GET" | "POST" | "PATCH" | "DELETE";
type Result<K extends EndpointId> = Promise<EndpointOutput<K> & { $meta: ResponseMeta }>;

/**
 * @example
 * const pluck = new Pluck({ apiKey: process.env.PLUCK_API_KEY });
 * const page = await pluck.scrape({ url: "https://example.com" });
 * console.log(page.markdown);
 */
export class Pluck {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly opts: PluckOptions;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: PluckOptions = {}) {
    const env = typeof process !== "undefined" ? process.env : {};
    const apiKey = opts.apiKey ?? env.PLUCK_API_KEY;
    if (!apiKey) throw new Error("Pluck: missing apiKey (or PLUCK_API_KEY env var).");
    this.apiKey = apiKey;
    this.baseUrl = (opts.baseUrl ?? env.PLUCK_API_URL ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.opts = opts;
    this.fetchImpl = opts.fetch ?? fetch;
  }

  private async request<K extends EndpointId>(
    method: Method,
    path: string,
    body?: unknown,
    query?: Record<string, unknown>,
  ): Result<K> {
    const url = new URL(this.baseUrl + path);
    for (const [k, v] of Object.entries(query ?? {}))
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));

    const headers: Record<string, string> = {
      authorization: `Bearer ${this.apiKey}`,
      "user-agent": "pluck-sdk-ts/0.1.0",
    };
    if (body !== undefined) headers["content-type"] = "application/json";
    const { llm } = this.opts;
    if (llm?.provider) headers["x-llm-provider"] = llm.provider;
    if (llm?.apiKey) headers["x-llm-key"] = llm.apiKey;
    if (llm?.model) headers["x-llm-model"] = llm.model;
    if (llm?.baseUrl) headers["x-llm-base-url"] = llm.baseUrl;

    const retries = this.opts.maxRetries ?? 2;
    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await this.fetchImpl(url, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(this.opts.timeoutMs ?? 180_000),
        });
      } catch (err) {
        if (attempt < retries) {
          await sleep(backoff(attempt));
          continue;
        }
        throw err;
      }
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        await sleep(Number(res.headers.get("retry-after")) * 1000 || backoff(attempt));
        continue;
      }
      const json = (await res.json().catch(() => null)) as
        | ({ data: EndpointOutput<K>; meta: ResponseMeta } & Partial<ErrorBody>)
        | null;
      if (!res.ok || !json || json.error) {
        throw new PluckApiError(
          res.status,
          json?.error?.code ?? "internal",
          json?.error?.message ?? `HTTP ${res.status}`,
          json?.error?.requestId,
          json?.error?.details,
        );
      }
      return Object.assign(json.data as object, { $meta: json.meta }) as EndpointOutput<K> & {
        $meta: ResponseMeta;
      };
    }
  }

  scrape = (input: EndpointInput<"scrape">) => this.request<"scrape">("POST", "/v1/scrape", input);
  parse = (input: EndpointInput<"parse">) => this.request<"parse">("POST", "/v1/parse", input);
  map = (input: EndpointInput<"map">) => this.request<"map">("POST", "/v1/map", input);
  screenshot = (input: EndpointInput<"screenshot">) =>
    this.request<"screenshot">("POST", "/v1/screenshot", input);
  search = (input: EndpointInput<"search">) => this.request<"search">("POST", "/v1/search", input);
  extract = (input: EndpointInput<"extract">) =>
    this.request<"extract">("POST", "/v1/extract", input);
  product = (input: EndpointInput<"product">) =>
    this.request<"product">("POST", "/v1/extract/product", input);
  products = (input: EndpointInput<"products">) =>
    this.request<"products">("POST", "/v1/extract/products", input);
  styleguide = (input: EndpointInput<"styleguide">) =>
    this.request<"styleguide">("POST", "/v1/styleguide", input);
  brand = (input: EndpointInput<"brand">) =>
    this.request<"brand">("GET", "/v1/brand", undefined, input as Record<string, unknown>);
  classify = (input: EndpointInput<"classify">) =>
    this.request<"classify">("POST", "/v1/brand/classify", input);
  transaction = (input: EndpointInput<"transaction">) =>
    this.request<"transaction">("POST", "/v1/brand/transaction", input);
  usage = (input: EndpointInput<"usage"> = {}) =>
    this.request<"usage">("GET", "/v1/usage", undefined, input as Record<string, unknown>);

  /** Public logo URL. No request is made and no credits are used. */
  logoUrl = (domain: string, opts: { size?: number; format?: "png" | "webp" } = {}) =>
    `${this.baseUrl}/v1/logo/${encodeURIComponent(domain)}?size=${opts.size ?? 128}${opts.format ? `&format=${opts.format}` : ""}`;

  crawl = {
    start: (input: EndpointInput<"crawlStart">) =>
      this.request<"crawlStart">("POST", "/v1/crawl", input),
    get: (id: string, page: { cursor?: string; limit?: number } = {}) =>
      this.request<"crawlGet">("GET", `/v1/crawl/${id}`, undefined, page),
    cancel: (id: string) => this.request<"crawlCancel">("DELETE", `/v1/crawl/${id}`),
    /** Starts a crawl, waits for it to finish and returns every page. */
    run: async (
      input: EndpointInput<"crawlStart">,
      { pollMs = 2_000 }: { pollMs?: number } = {},
    ) => {
      const job = await this.crawl.start(input);
      let status = await this.crawl.get(job.id, { limit: 1 });
      while (status.status === "queued" || status.status === "running") {
        await sleep(pollMs);
        status = await this.crawl.get(job.id, { limit: 1 });
      }
      const pages = [];
      let cursor: string | undefined;
      do {
        const batch = await this.crawl.get(job.id, { cursor, limit: 100 });
        pages.push(...batch.pages);
        cursor = batch.nextCursor ?? undefined;
      } while (cursor);
      return { ...status, pages };
    },
  };

  monitors = {
    create: (input: EndpointInput<"monitorCreate">) =>
      this.request<"monitorCreate">("POST", "/v1/monitors", input),
    list: (page: { cursor?: string; limit?: number } = {}) =>
      this.request<"monitorList">("GET", "/v1/monitors", undefined, page),
    get: (id: string) => this.request<"monitorGet">("GET", `/v1/monitors/${id}`),
    update: (id: string, patch: Omit<EndpointInput<"monitorUpdate">, "id">) =>
      this.request<"monitorUpdate">("PATCH", `/v1/monitors/${id}`, patch),
    delete: (id: string) => this.request<"monitorDelete">("DELETE", `/v1/monitors/${id}`),
    changes: (id: string, page: { cursor?: string; limit?: number } = {}) =>
      this.request<"monitorChanges">("GET", `/v1/monitors/${id}/changes`, undefined, page),
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const backoff = (attempt: number) =>
  Math.min(8_000, 500 * 2 ** attempt) * (0.8 + Math.random() * 0.4);

/**
 * Verify a Pluck webhook signature (`pluck-signature: t=...,v1=...`).
 * Works in Node, Deno, Bun and edge runtimes.
 */
export async function verifyWebhook(
  body: string,
  header: string | null,
  secret: string,
  toleranceSeconds = 300,
): Promise<boolean> {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > toleranceSeconds || !parts.v1) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${body}`)),
  );
  const expected = Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("");
  if (expected.length !== parts.v1.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ parts.v1.charCodeAt(i);
  return diff === 0;
}
