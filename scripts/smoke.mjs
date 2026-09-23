#!/usr/bin/env node
/**
 * End-to-end check against a running Pluck instance.
 *
 *   node scripts/smoke.mjs                       # uses PUBLIC_API_URL + BOOTSTRAP_API_KEY from .env
 *   PLUCK_API_URL=http://localhost:8080 node scripts/smoke.mjs
 *
 * Exits non-zero if any check fails, so it can gate a deploy.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = {};
try {
  for (const line of readFileSync(join(ROOT, ".env"), "utf8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {
  // Fall back to the process environment.
}

const BASE = (process.env.PLUCK_API_URL ?? env.PUBLIC_API_URL ?? "http://localhost:8080").replace(
  /\/$/,
  "",
);
const KEY = process.env.PLUCK_API_KEY ?? env.BOOTSTRAP_API_KEY;
const WEB = (process.env.PLUCK_WEB_URL ?? env.PUBLIC_WEB_URL ?? "").replace(/\/$/, "");
const MCP = (process.env.PLUCK_MCP_URL ?? env.PUBLIC_MCP_URL ?? "").replace(/\/$/, "");

if (!KEY) {
  console.error("No API key. Set BOOTSTRAP_API_KEY in .env or PLUCK_API_KEY in the environment.");
  process.exit(1);
}

let passed = 0;
let failed = 0;

async function check(name, fn) {
  const started = Date.now();
  try {
    const detail = await fn();
    passed++;
    console.log(
      `  ok   ${name.padEnd(34)} ${String(Date.now() - started).padStart(6)}ms  ${detail ?? ""}`,
    );
  } catch (err) {
    failed++;
    console.log(
      `  FAIL ${name.padEnd(34)} ${String(Date.now() - started).padStart(6)}ms  ${err instanceof Error ? err.message : err}`,
    );
  }
}

async function call(path, { method = "POST", body, key = KEY, headers = {} } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(key ? { authorization: `Bearer ${key}` } : {}),
      "content-type": "application/json",
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(120_000),
  });
  const json = await res.json().catch(() => null);
  return { res, json };
}

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

console.log(`\nPluck smoke test → ${BASE}\n`);

await check("GET /health", async () => {
  const { res, json } = await call("/health", { method: "GET", key: null });
  assert(res.ok && json?.status === "ok", `status ${res.status} ${JSON.stringify(json)}`);
  return `version ${json.version}`;
});

await check("GET /openapi.json", async () => {
  const { res, json } = await call("/openapi.json", { method: "GET", key: null });
  assert(res.ok && json?.openapi, `status ${res.status}`);
  return `${Object.keys(json.paths).length} paths`;
});

await check("auth rejects a bad key", async () => {
  const { res, json } = await call("/v1/scrape", {
    body: { url: "https://example.com" },
    key: "pk_live_nope",
  });
  assert(res.status === 401 && json?.error?.code === "invalid_api_key", `status ${res.status}`);
});

await check("validation rejects a bad body", async () => {
  const { res, json } = await call("/v1/scrape", { body: { url: "not-a-url" } });
  assert(
    res.status === 400 && json?.error?.code === "bad_request",
    `status ${res.status} ${JSON.stringify(json)}`,
  );
});

await check("SSRF: localhost is refused", async () => {
  const { res, json } = await call("/v1/scrape", { body: { url: "http://127.0.0.1:8080/health" } });
  assert(res.status === 400 || res.status === 403, `status ${res.status} ${JSON.stringify(json)}`);
});

await check("POST /v1/scrape (http path)", async () => {
  const { res, json } = await call("/v1/scrape", {
    body: { url: "https://example.com", formats: ["markdown", "links"], maxAge: 0 },
  });
  assert(res.ok, `status ${res.status} ${JSON.stringify(json?.error)}`);
  assert(json.data.markdown?.includes("Example Domain"), "markdown missing expected text");
  return `${json.data.markdown.length} chars, ${json.meta.creditsUsed} credit(s), ${json.data.renderedWith}`;
});

await check("POST /v1/scrape (cache hit)", async () => {
  await call("/v1/scrape", {
    body: { url: "https://example.com", formats: ["markdown"], maxAge: 3600 },
  });
  const { res, json } = await call("/v1/scrape", {
    body: { url: "https://example.com", formats: ["markdown"], maxAge: 3600 },
  });
  assert(res.ok && json.meta.cached === true, `not cached: ${JSON.stringify(json.meta)}`);
  return `${json.meta.durationMs}ms`;
});

await check("POST /v1/scrape (browser render)", async () => {
  const { res, json } = await call("/v1/scrape", {
    body: { url: "https://react.dev", formats: ["markdown"], render: "always", maxAge: 0 },
  });
  assert(res.ok, `status ${res.status} ${JSON.stringify(json?.error)}`);
  assert(json.data.renderedWith === "browser", `renderedWith=${json.data.renderedWith}`);
  return `${json.data.markdown.length} chars, ${json.meta.creditsUsed} credits`;
});

await check("POST /v1/screenshot", async () => {
  const { res, json } = await call("/v1/screenshot", {
    body: { url: "https://example.com", format: "webp", maxAge: 0 },
  });
  assert(res.ok, `status ${res.status} ${JSON.stringify(json?.error)}`);
  assert(
    typeof json.data.screenshot === "string" && json.data.screenshot.length > 0,
    "no screenshot",
  );
  return json.data.screenshot.startsWith("http")
    ? "stored in object storage"
    : "returned as data URI";
});

await check("POST /v1/parse (pdf)", async () => {
  const { res, json } = await call("/v1/parse", {
    body: { url: "https://arxiv.org/pdf/1706.03762" },
  });
  assert(res.ok, `status ${res.status} ${JSON.stringify(json?.error)}`);
  assert(json.data.markdown.includes("Attention"), "pdf text missing");
  return `${json.data.pages} pages`;
});

await check("POST /v1/map", async () => {
  const { res, json } = await call("/v1/map", { body: { url: "https://vercel.com", limit: 200 } });
  assert(
    res.ok && json.data.links.length > 10,
    `status ${res.status}, ${json?.data?.links?.length} links`,
  );
  return `${json.data.links.length} urls`;
});

await check("GET /v1/brand", async () => {
  const { res, json } = await call("/v1/brand?domain=stripe.com", { method: "GET" });
  assert(res.ok, `status ${res.status} ${JSON.stringify(json?.error)}`);
  assert(json.data.logos.length > 0, "no logos found");
  return `${json.data.name}, ${json.data.logos.length} logos, ${json.data.colors.length} colors`;
});

await check("GET /v1/logo/:domain (public)", async () => {
  const res = await fetch(`${BASE}/v1/logo/stripe.com?size=64`, {
    signal: AbortSignal.timeout(60_000),
  });
  assert(res.ok, `status ${res.status}`);
  const bytes = (await res.arrayBuffer()).byteLength;
  assert(bytes > 200, `only ${bytes} bytes`);
  return `${res.headers.get("content-type")}, ${bytes} bytes`;
});

await check("POST /v1/crawl → status", async () => {
  const { res, json } = await call("/v1/crawl", {
    body: { url: "https://example.com", limit: 2, maxDepth: 1 },
  });
  assert(res.status === 202 || res.ok, `status ${res.status} ${JSON.stringify(json?.error)}`);
  const id = json.data.id;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const poll = await call(`/v1/crawl/${id}?limit=5`, { method: "GET" });
    if (poll.json?.data?.status === "completed")
      return `${poll.json.data.completed} page(s), ${poll.json.data.creditsUsed} credits`;
    if (poll.json?.data?.status === "failed")
      throw new Error(poll.json.data.error ?? "crawl failed");
  }
  throw new Error("crawl did not finish within 80s");
});

await check("monitor create → delete", async () => {
  const created = await call("/v1/monitors", {
    body: { type: "page", url: "https://example.com", intervalMinutes: 1440, name: "smoke" },
  });
  assert(
    created.res.ok || created.res.status === 201,
    `status ${created.res.status} ${JSON.stringify(created.json?.error)}`,
  );
  const id = created.json.data.id;
  const removed = await call(`/v1/monitors/${id}`, { method: "DELETE" });
  assert(removed.res.ok, `delete status ${removed.res.status}`);
  return id;
});

await check("GET /v1/webhooks/deliveries", async () => {
  const { res, json } = await call("/v1/webhooks/deliveries?limit=1", { method: "GET" });
  assert(res.ok, `status ${res.status}`);
  assert(Array.isArray(json.data.deliveries), "no deliveries array");
  return `${json.data.deliveries.length} shown`;
});

await check("POST /v1/webhooks/test refuses private targets", async () => {
  const { res } = await call("/v1/webhooks/test", { body: { url: "http://127.0.0.1:9/hook" } });
  assert(res.status === 403, `expected 403, got ${res.status}`);
});

await check("GET /v1/usage", async () => {
  const { res, json } = await call("/v1/usage?days=1", { method: "GET" });
  assert(res.ok, `status ${res.status}`);
  return `${json.data.totalRequests} requests, ${json.data.totalCredits} credits, balance ${json.data.balance ?? "unmetered"}`;
});

if (MCP) {
  await check("MCP tools/list", async () => {
    const res = await fetch(`${MCP}/mcp`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${KEY}`,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      signal: AbortSignal.timeout(30_000),
    });
    const text = await res.text();
    assert(res.ok, `status ${res.status} ${text.slice(0, 200)}`);
    const payload = JSON.parse(text.replace(/^event:.*\ndata: /m, ""));
    const tools = payload.result?.tools ?? [];
    assert(tools.length > 0, `no tools: ${text.slice(0, 200)}`);
    return `${tools.length} tools`;
  });
}

if (WEB) {
  for (const path of [
    "/",
    "/pricing",
    "/docs",
    "/docs/mcp",
    "/trust",
    "/.well-known/security.txt",
    "/sitemap.xml",
    "/robots.txt",
    "/opengraph-image",
  ]) {
    await check(`web ${path}`, async () => {
      const res = await fetch(WEB + path, { signal: AbortSignal.timeout(30_000) });
      assert(res.ok, `status ${res.status}`);
      return res.headers.get("content-type")?.split(";")[0] ?? "";
    });
  }
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
