import { SecretBox } from "@pluck/ai";
import { ProxyPool, type ProxyTier } from "@pluck/core";
import { type Database, userProxies } from "@pluck/db";
import { PluckError } from "@pluck/shared";
import { and, asc, eq } from "drizzle-orm";
import { ProxyAgent, request } from "undici";
import type { Config } from "./config.js";

/** How many consecutive failures retire a proxy from rotation. */
const FAILURE_LIMIT = 5;

/** Providers hand out `http://`, `https://` or `socks5://` gateway URLs. */
const SCHEMES = new Set(["http:", "https:", "socks5:", "socks5h:", "socks4:"]);

/**
 * Hosts a proxy may not point at. A proxy URL is a request this server makes on
 * the caller's behalf, so pointing one at the loopback or the metadata service
 * would turn the feature into an SSRF hole.
 */
const BLOCKED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "169.254.169.254",
  "metadata.google.internal",
]);

const PRIVATE_V4 =
  /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/;

/** Validates a proxy URL and returns a version safe to display. */
export function parseProxyUrl(raw: string, allowPrivate = false): { url: URL; hint: string } {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new PluckError("bad_request", "That is not a valid proxy URL.");
  }
  if (!SCHEMES.has(url.protocol)) {
    throw new PluckError(
      "bad_request",
      `Proxy scheme ${url.protocol.replace(":", "")} is not supported. Use http, https or socks5.`,
    );
  }
  if (!url.hostname) throw new PluckError("bad_request", "The proxy URL needs a host.");
  if (!allowPrivate) {
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (BLOCKED_HOSTS.has(host) || PRIVATE_V4.test(host) || host.endsWith(".local")) {
      throw new PluckError(
        "bad_request",
        "A proxy on a private or loopback address is not allowed.",
      );
    }
  }
  // Credentials are the secret part; the hint keeps the gateway recognisable.
  const user = url.username ? `${url.username.slice(0, 3)}…@` : "";
  return { url, hint: `${url.protocol}//${user}${url.host}` };
}

export interface StoredProxy {
  id: string;
  label: string;
  tier: ProxyTier;
  urlHint: string;
  active: boolean;
  failures: number;
}

/**
 * Resolves which proxies a request may use: an account's own first, the
 * instance's environment pool second. Nothing is cached for long — a proxy
 * removed in the dashboard stops being used within a minute.
 */
export class ProxyDirectory {
  private readonly box: SecretBox;
  private readonly cache = new Map<string, { at: number; pool: ProxyPool | null }>();
  private readonly ttlMs = 60_000;

  constructor(
    private readonly db: Database,
    private readonly config: Pick<Config, "PLUCK_ENCRYPTION_KEY" | "ALLOW_PRIVATE_NETWORK">,
    private readonly fallback: ProxyPool,
  ) {
    this.box = new SecretBox(config.PLUCK_ENCRYPTION_KEY);
  }

  seal(rawUrl: string) {
    const { url, hint } = parseProxyUrl(rawUrl, this.config.ALLOW_PRIVATE_NETWORK);
    return { encryptedUrl: this.box.seal(url.toString()), urlHint: hint };
  }

  /** The stored URL, for a connection test. Never send this to a browser. */
  reveal(sealed: string): string {
    return this.box.open(sealed);
  }

  invalidate(orgId: string) {
    this.cache.delete(orgId);
  }

  /** The pool for one caller, or the instance pool when they have none. */
  async forOrg(orgId: string): Promise<ProxyPool> {
    const cached = this.cache.get(orgId);
    if (cached && Date.now() - cached.at < this.ttlMs) return cached.pool ?? this.fallback;

    const rows = await this.db
      .select()
      .from(userProxies)
      .where(and(eq(userProxies.orgId, orgId), eq(userProxies.active, true)))
      .orderBy(asc(userProxies.id));

    const usable = rows.filter((row) => row.failures < FAILURE_LIMIT);
    if (usable.length === 0) {
      this.cache.set(orgId, { at: Date.now(), pool: null });
      return this.fallback;
    }

    const config = { datacenter: [] as string[], residential: [] as string[] };
    for (const row of usable) {
      try {
        config[row.tier].push(this.box.open(row.encryptedUrl));
      } catch {
        // A row that cannot be decrypted (rotated key) is simply skipped.
      }
    }
    // Tiers the caller has not configured still fall back to the instance's.
    const pool = new ProxyPool({
      datacenter: config.datacenter.length ? config.datacenter : this.fallback.urls("datacenter"),
      residential: config.residential.length
        ? config.residential
        : this.fallback.urls("residential"),
    });
    this.cache.set(orgId, { at: Date.now(), pool });
    return pool;
  }
}

/**
 * Sends one request through a proxy and reports the exit address.
 *
 * Providers fail in ways that only show up on a real connection — wrong port,
 * expired credentials, an IP allowlist that does not include this server — so
 * the dashboard's "test" button makes the connection rather than parsing the
 * URL again.
 */
export async function checkProxyUrl(
  proxyUrl: string,
  timeoutMs = 15_000,
): Promise<{ ok: true; ip: string } | { ok: false; error: string }> {
  const agent = new ProxyAgent({ uri: proxyUrl, connections: 1 });
  const attempt = async (): Promise<{ ok: true; ip: string } | { ok: false; error: string }> => {
    try {
      const res = await request("https://api.ipify.org?format=json", {
        dispatcher: agent,
        headersTimeout: timeoutMs,
        bodyTimeout: timeoutMs,
      });
      const body = (await res.body.json()) as { ip?: string };
      if (res.statusCode >= 400)
        return { ok: false, error: `Proxy returned HTTP ${res.statusCode}.` };
      if (!body.ip) return { ok: false, error: "The proxy answered, but not with an address." };
      return { ok: true, ip: body.ip };
    } catch (err) {
      return { ok: false, error: `Could not reach the proxy: ${explain(err)}.` };
    }
  };

  // Neither the per-phase timeouts nor an abort signal cover undici's CONNECT
  // to the gateway, which is exactly where a dead proxy hangs, so the deadline
  // is enforced out here.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<{ ok: false; error: string }>((resolve) => {
    timer = setTimeout(
      () => resolve({ ok: false, error: "Could not reach the proxy: timed out." }),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([attempt(), deadline]);
  } finally {
    clearTimeout(timer);
    // `close` waits for the in-flight request, which is the very thing that may
    // be hanging; `destroy` drops the socket now.
    void agent.destroy().catch(() => {});
  }
}

type Nested = { code?: string; message?: string; cause?: Nested };

/**
 * Turns a connection failure into something an operator can act on. undici
 * nests the real cause one or two levels down and does not always set `code`,
 * so both the chain and the message are inspected.
 */
function explain(err: unknown): string {
  let node = err as Nested | undefined;
  if ((err as { name?: string }).name === "TimeoutError")
    return "timed out — the gateway did not answer";
  const messages: string[] = [];
  for (let depth = 0; node && depth < 4; depth++) {
    if (node.code) {
      const known = CONNECT_ERRORS[node.code];
      if (known) return known;
    }
    if (node.message) messages.push(node.message);
    node = node.cause;
  }
  const text = messages.join(" ");
  for (const [code, reason] of Object.entries(CONNECT_ERRORS)) {
    if (text.includes(code)) return reason;
  }
  // 407 arrives as a socket error from some gateways rather than a response.
  if (/407|proxy authentication/i.test(text)) return "the proxy rejected those credentials";
  return messages[0] ?? "connection failed";
}

const CONNECT_ERRORS: Record<string, string> = {
  ECONNREFUSED: "connection refused — check the port",
  ENOTFOUND: "host not found — check the gateway address",
  EAI_AGAIN: "host not found — check the gateway address",
  ETIMEDOUT: "timed out — the gateway did not answer",
  ABORT_ERR: "timed out — the gateway did not answer",
  TimeoutError: "timed out — the gateway did not answer",
  UND_ERR_CONNECT_TIMEOUT: "timed out — the gateway did not answer",
  UND_ERR_HEADERS_TIMEOUT: "timed out — the gateway did not answer",
  ECONNRESET: "the gateway closed the connection",
  EPROTO: "the gateway spoke a different protocol — check http vs https",
  ERR_TLS_CERT_ALTNAME_INVALID: "the certificate did not match the gateway",
  CERT_HAS_EXPIRED: "the gateway's certificate has expired",
};
