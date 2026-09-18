import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { PluckError } from "@pluck/shared";
import { Agent, type Dispatcher, fetch, ProxyAgent } from "undici";
import type { ProxyPool, ProxyUsed } from "./proxy.js";
import { assertPublicUrl, createSafeLookup } from "./ssrf.js";

export const CHROME_VERSION = "148";

export const DESKTOP_UA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_VERSION}.0.0.0 Safari/537.36`;
export const MOBILE_UA = `Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_VERSION}.0.0.0 Mobile Safari/537.36`;

export function browserHeaders(mobile: boolean): Record<string, string> {
  return {
    "user-agent": mobile ? MOBILE_UA : DESKTOP_UA,
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "accept-language": "en-US,en;q=0.9",
    "accept-encoding": "gzip, deflate, br, zstd",
    "sec-ch-ua": `"Chromium";v="${CHROME_VERSION}", "Not=A?Brand";v="24", "Google Chrome";v="${CHROME_VERSION}"`,
    "sec-ch-ua-mobile": mobile ? "?1" : "?0",
    "sec-ch-ua-platform": mobile ? '"Android"' : '"Windows"',
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "none",
    "sec-fetch-user": "?1",
    "upgrade-insecure-requests": "1",
  };
}

export interface FetchOptions {
  headers?: Record<string, string>;
  timeout?: number;
  maxBytes?: number;
  proxy?: ProxyUsed;
  /** Overrides the client's pool, e.g. with the caller's own proxies. */
  pool?: ProxyPool;
  country?: string;
  mobile?: boolean;
  signal?: AbortSignal;
  method?: "GET" | "HEAD";
}

export interface FetchResult {
  url: string;
  finalUrl: string;
  status: number;
  headers: Headers;
  contentType: string | null;
  body: Buffer;
  proxyUsed: ProxyUsed;
  truncated: boolean;
}

export interface HttpClientOptions {
  proxies: ProxyPool;
  allowPrivateNetwork: boolean;
  /** Default max body size in bytes. */
  maxBytes?: number;
}

/**
 * Hardened HTTP client: SSRF-safe DNS at connect time, per-hop redirect
 * validation, streaming size cap, keep-alive pooling and proxy routing.
 */
export class HttpClient {
  private readonly direct: Agent;
  private readonly proxyAgents = new Map<string, ProxyAgent>();
  private readonly maxBytes: number;

  constructor(private readonly opts: HttpClientOptions) {
    this.maxBytes = opts.maxBytes ?? 25 * 1024 * 1024;
    this.direct = new Agent({
      connect: { lookup: createSafeLookup(opts.allowPrivateNetwork), timeout: 10_000 },
      keepAliveTimeout: 30_000,
      keepAliveMaxTimeout: 120_000,
      connections: 256,
      pipelining: 1,
      allowH2: true,
    });
  }

  get proxies(): ProxyPool {
    return this.opts.proxies;
  }

  private dispatcher(proxy: ProxyUsed, country?: string, pool?: ProxyPool): Dispatcher {
    if (proxy === "none") return this.direct;
    const picked = (pool ?? this.opts.proxies).pick(proxy, { country });
    if (!picked) return this.direct;
    let agent = this.proxyAgents.get(picked.url);
    if (!agent) {
      agent = new ProxyAgent({ uri: picked.url, connections: 64, keepAliveTimeout: 30_000 });
      if (this.proxyAgents.size > 500) this.proxyAgents.clear();
      this.proxyAgents.set(picked.url, agent);
    }
    return agent;
  }

  async fetch(rawUrl: string, options: FetchOptions = {}): Promise<FetchResult> {
    const proxy = options.proxy ?? "none";
    const timeout = options.timeout ?? 30_000;
    const maxBytes = options.maxBytes ?? this.maxBytes;
    const signal = options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(timeout)])
      : AbortSignal.timeout(timeout);
    const headers = {
      ...browserHeaders(options.mobile ?? false),
      ...lowerKeys(options.headers ?? {}),
    };
    const dispatcher = this.dispatcher(proxy, options.country, options.pool);

    let current = assertPublicUrl(rawUrl, this.opts.allowPrivateNetwork);
    try {
      for (let hop = 0; hop <= 10; hop++) {
        const res = await fetch(current, {
          method: options.method ?? "GET",
          headers,
          redirect: "manual",
          signal,
          dispatcher,
        });

        if (res.status >= 300 && res.status < 400 && res.headers.has("location")) {
          await res.body?.cancel();
          const next = new URL(res.headers.get("location")!, current);
          current = assertPublicUrl(next.href, this.opts.allowPrivateNetwork);
          continue;
        }

        const { body, truncated } = await readCapped(res.body, maxBytes);
        return {
          url: rawUrl,
          finalUrl: current.href,
          status: res.status,
          headers: res.headers as unknown as Headers,
          contentType: res.headers.get("content-type"),
          body,
          proxyUsed: proxy,
          truncated,
        };
      }
      throw new PluckError("target_unreachable", "Too many redirects.");
    } catch (err) {
      throw normaliseNetworkError(err, current.href);
    }
  }

  async close(): Promise<void> {
    await Promise.all([
      this.direct.close(),
      ...[...this.proxyAgents.values()].map((a) => a.close()),
    ]);
  }
}

async function readCapped(
  stream: WebReadableStream | null,
  maxBytes: number,
): Promise<{ body: Buffer; truncated: boolean }> {
  if (!stream) return { body: Buffer.alloc(0), truncated: false };
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      chunks.push(value.subarray(0, value.byteLength - (size - maxBytes)));
      return { body: Buffer.concat(chunks), truncated: true };
    }
    chunks.push(value);
  }
  return { body: Buffer.concat(chunks), truncated: false };
}

const lowerKeys = (h: Record<string, string>) =>
  Object.fromEntries(Object.entries(h).map(([k, v]) => [k.toLowerCase(), v]));

export function normaliseNetworkError(err: unknown, url: string): Error {
  if (err instanceof PluckError) return err;
  const e = err as {
    name?: string;
    code?: string;
    cause?: { code?: string; message?: string };
    message?: string;
  };
  const code = e.cause?.code ?? e.code;
  if (code === "EPLUCKSSRF")
    return new PluckError("forbidden", "Private network addresses cannot be scraped.");
  if (
    e.name === "TimeoutError" ||
    e.name === "AbortError" ||
    code === "UND_ERR_CONNECT_TIMEOUT" ||
    code === "UND_ERR_HEADERS_TIMEOUT"
  ) {
    return new PluckError("target_timeout", `Timed out fetching ${url}`);
  }
  if (code === "ENOTFOUND" || code === "EAI_AGAIN")
    return new PluckError("target_unreachable", `Could not resolve ${new URL(url).hostname}`);
  return new PluckError(
    "target_unreachable",
    `Failed to fetch ${url}: ${e.cause?.message ?? e.message ?? "network error"}`,
  );
}

/** Decode a body honouring the HTTP charset, then any <meta charset>. */
export function decodeBody(body: Buffer, contentType: string | null): string {
  const fromHeader = /charset=["']?([\w-]+)/i.exec(contentType ?? "")?.[1];
  let charset = fromHeader;
  if (!charset) {
    const head = body.subarray(0, 2048).toString("latin1");
    charset = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1];
  }
  try {
    return new TextDecoder(charset ?? "utf-8", { fatal: false }).decode(body);
  } catch {
    return new TextDecoder("utf-8").decode(body);
  }
}
