import type { EndpointId, EndpointInput, EndpointOutput, ResponseMeta } from "@pluck/shared";
import { CONFIG } from "./config";
import type { Account } from "./types";

/**
 * The endpoints the extension uses. Types come from the shared registry; the
 * method and path are repeated here so the bundle does not have to carry the
 * registry's schemas. `api.test.ts` fails if the two ever disagree.
 */
export const ROUTES = {
  scrape: ["POST", "/v1/scrape"],
  parse: ["POST", "/v1/parse"],
  map: ["POST", "/v1/map"],
  screenshot: ["POST", "/v1/screenshot"],
  search: ["POST", "/v1/search"],
  extract: ["POST", "/v1/extract"],
  styleguide: ["POST", "/v1/styleguide"],
  brand: ["GET", "/v1/brand"],
  usage: ["GET", "/v1/usage"],
} as const satisfies Partial<Record<EndpointId, readonly ["GET" | "POST", string]>>;

export type Route = keyof typeof ROUTES;

export type Credentials = Pick<Account, "apiKey" | "apiUrl">;

export interface ApiResult<K extends Route> {
  data: EndpointOutput<K>;
  meta: ResponseMeta;
}

export class ApiError extends Error {
  constructor(
    /** An API error code, or `network` / `timeout` for failures before an answer. */
    readonly code: string,
    message: string,
    readonly status = 0,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const isAbort = (err: unknown): boolean =>
  err instanceof DOMException && err.name === "AbortError";

/** The slowest call is a browser render followed by a model; the API allows 180s. */
const DEFAULT_TIMEOUT_MS = 150_000;

async function send(
  url: URL,
  init: RequestInit,
  { signal, timeoutMs = DEFAULT_TIMEOUT_MS }: { signal?: AbortSignal; timeoutMs?: number },
): Promise<Response> {
  const timeout = AbortSignal.timeout(timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
  } catch {
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    if (timeout.aborted) throw new ApiError("timeout", "That took too long and was stopped.");
    throw new ApiError("network", `Could not reach ${url.host}.`);
  }
}

/** Calls one endpoint with the account's key. Throws `ApiError` on any failure. */
export async function call<K extends Route>(
  account: Credentials,
  id: K,
  input: EndpointInput<K>,
  opts: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<ApiResult<K>> {
  const [method, path] = ROUTES[id];
  // Appended, not resolved: an instance may be served under a path prefix.
  const url = new URL(account.apiUrl.replace(/\/+$/, "") + path);
  const headers: Record<string, string> = { authorization: `Bearer ${account.apiKey}` };
  let body: string | undefined;
  if (method === "GET") {
    for (const [key, value] of Object.entries(input as Record<string, unknown>))
      if (value !== undefined && value !== null && value !== "")
        url.searchParams.set(key, String(value));
  } else {
    headers["content-type"] = "application/json";
    body = JSON.stringify(input);
  }

  const res = await send(url, { method, headers, body }, opts);
  const payload = (await res.json().catch(() => null)) as {
    data?: EndpointOutput<K>;
    meta?: ResponseMeta;
    error?: { code?: string; message?: string; requestId?: string };
  } | null;

  if (!res.ok || !payload?.data || !payload.meta) {
    throw new ApiError(
      payload?.error?.code ?? "internal",
      payload?.error?.message ?? `The API answered HTTP ${res.status}.`,
      res.status,
      payload?.error?.requestId ?? res.headers.get("x-request-id") ?? undefined,
    );
  }
  return { data: payload.data, meta: payload.meta };
}

export interface DemoResult {
  markdown: string;
  links: string[];
  durationMs: number;
}

/**
 * The site's public preview: one page as markdown, cut short, with no account.
 * It is what the signed-out panel offers so the first thing anyone does with
 * the extension is see it work.
 */
export async function demo(url: string, signal?: AbortSignal): Promise<DemoResult> {
  const res = await send(
    new URL("/api/demo", CONFIG.siteUrl),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url }),
    },
    { signal, timeoutMs: 45_000 },
  );
  const payload = (await res.json().catch(() => null)) as (DemoResult & { error?: string }) | null;
  if (!res.ok || !payload || payload.error)
    throw new ApiError(
      res.status === 429 ? "rate_limited" : "demo",
      payload?.error ?? "The preview is not available right now.",
      res.status,
    );
  return payload;
}

/** What went wrong, in words, and the one thing that would fix it. */
export interface Problem {
  title: string;
  detail: string;
  action?: "reconnect" | "credits" | "live" | "model";
  requestId?: string;
}

export function explain(err: unknown): Problem {
  if (!(err instanceof ApiError))
    return {
      title: "Something went wrong",
      detail: err instanceof Error ? err.message : "An unexpected error stopped this run.",
    };
  const base = { detail: err.message, requestId: err.requestId };
  switch (err.code) {
    case "invalid_api_key":
      return {
        ...base,
        title: "This key no longer works",
        detail: "It was revoked or replaced. Connect again to get a new one.",
        action: "reconnect",
      };
    case "insufficient_credits":
      return { ...base, title: "Out of credits", action: "credits" };
    case "rate_limited":
      return { ...base, title: "Too many requests" };
    case "target_blocked":
    case "target_unreachable":
    case "target_timeout":
    case "blocked_by_robots":
      return { ...base, title: "The page could not be fetched", action: "live" };
    case "llm_not_configured":
      return { ...base, title: "No model is configured", action: "model" };
    case "llm_failed":
      return { ...base, title: "The model did not answer" };
    case "unsupported_content":
      return { ...base, title: "This kind of content is not supported" };
    case "bad_request":
      return { ...base, title: "The request was not accepted" };
    case "network":
      return { ...base, title: "No connection to the API" };
    case "timeout":
      return { ...base, title: "Timed out" };
    default:
      return { ...base, title: "The API reported a problem" };
  }
}
