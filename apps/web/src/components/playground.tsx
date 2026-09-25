"use client";

import { type EndpointId, endpoints } from "@pluck/shared";
import { useMemo, useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { EndpointSelect, methodColor } from "@/components/endpoint-select";
import { JsonEditor } from "@/components/json-editor";
import { JsonView } from "@/components/json-view";
import { SITE } from "@/lib/site";

const PRESETS: Partial<Record<EndpointId, Record<string, unknown>>> = {
  scrape: { url: "https://example.com", formats: ["markdown"] },
  parse: { url: "https://arxiv.org/pdf/1706.03762" },
  map: { url: "https://example.com", limit: 100 },
  screenshot: { url: "https://example.com", fullPage: false },
  crawlStart: { url: "https://example.com", limit: 10, maxDepth: 2 },
  crawlGet: { id: "crawl_…" },
  crawlCancel: { id: "crawl_…" },
  search: { query: "best open source web scraper", limit: 5 },
  extract: {
    url: "https://example.com",
    schema: {
      type: "object",
      properties: { title: { type: "string" }, summary: { type: "string" } },
    },
  },
  product: { url: "https://www.example-shop.com/product/42" },
  products: { url: "https://www.example-shop.com/collections/all", limit: 20 },
  styleguide: { url: "https://stripe.com" },
  brand: { domain: "stripe.com" },
  classify: { domain: "stripe.com" },
  transaction: { descriptor: "SQ *BLUE BOTTLE COFFE OAKLAND CA" },
  monitorCreate: { type: "page", url: "https://example.com/pricing", intervalMinutes: 1440 },
  monitorList: {},
  monitorGet: { id: "mon_…" },
  monitorUpdate: { id: "mon_…", active: false },
  monitorDelete: { id: "mon_…" },
  monitorChanges: { id: "mon_…" },
  usage: { days: 30 },
};

export function Playground() {
  const [id, setId] = useState<EndpointId>("scrape");
  const [body, setBody] = useState(() => JSON.stringify(PRESETS.scrape, null, 2));
  const [response, setResponse] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ status: number; credits?: number; ms?: number } | null>(null);
  const [running, setRunning] = useState(false);

  const endpoint = endpoints[id];
  const curl = useMemo(() => {
    const isGet = endpoint.method === "get";
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(body) as Record<string, unknown>;
    } catch {
      // Show the template even while the JSON is being edited.
    }
    let path: string = endpoint.path;
    for (const [k, v] of Object.entries(parsed)) path = path.replace(`{${k}}`, String(v));
    const query = isGet
      ? `?${new URLSearchParams(
          Object.entries(parsed)
            .filter(([k]) => !endpoint.path.includes(`{${k}}`))
            .map(([k, v]) => [k, String(v)]),
        )}`
      : "";
    return [
      `curl -X ${endpoint.method.toUpperCase()} "${SITE.apiUrl}${path}${query}"`,
      `  -H "Authorization: Bearer $PLUCK_API_KEY"`,
      ...(isGet
        ? []
        : [`  -H "Content-Type: application/json"`, `  -d '${body.replace(/\s+/g, " ")}'`]),
    ].join(" \\\n");
  }, [body, endpoint]);

  async function run() {
    setRunning(true);
    setResponse(null);
    setMeta(null);
    let input: Record<string, unknown>;
    try {
      input = JSON.parse(body) as Record<string, unknown>;
    } catch {
      setResponse("The request body is not valid JSON.");
      setRunning(false);
      return;
    }
    const res = await fetch("/api/playground", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ endpoint: id, input }),
    }).catch(() => null);
    const payload = (await res?.json().catch(() => null)) as {
      data?: unknown;
      meta?: { creditsUsed: number };
      error?: { message: string };
      elapsedMs?: number;
    } | null;
    setMeta({
      status: res?.status ?? 0,
      credits: payload?.meta?.creditsUsed,
      ms: payload?.elapsedMs,
    });
    setResponse(JSON.stringify(payload?.data ?? payload?.error ?? payload, null, 2));
    setRunning(false);
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div>
        <div className="text-sm">
          <span className="block text-[var(--ink-soft)]" id="endpoint-label">
            Endpoint
          </span>
          <div className="mt-1">
            <EndpointSelect
              value={id}
              onChange={(next) => {
                setId(next);
                setBody(JSON.stringify(PRESETS[next] ?? {}, null, 2));
                setResponse(null);
                setMeta(null);
              }}
            />
          </div>
        </div>
        <p className="mt-2 text-xs text-[var(--ink-faint)]">
          {endpoint.description} · {endpoint.cost}
        </p>

        <div className="mt-4 text-sm">
          <span className="block text-[var(--ink-soft)]">Request</span>
          <div className="mt-1">
            <JsonEditor value={body} onChange={setBody} label="Request body" />
          </div>
        </div>

        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={() => void run()}
            disabled={running}
            className="bg-[var(--accent)] px-4 py-2.5 text-sm text-white disabled:opacity-60 sm:py-2"
          >
            {running ? "Running…" : "Send request"}
          </button>
          <CopyButton
            text={curl}
            label="Copy as cURL"
            copiedLabel="cURL copied"
            className="btn-outline justify-center px-4 py-2.5 text-sm sm:py-2"
          />
        </div>
      </div>

      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-sm text-[var(--ink-soft)]">
            Response{" "}
            <span className={`mono text-xs ${methodColor(endpoint.method)}`}>
              {endpoint.method.toUpperCase()}
            </span>{" "}
            <span className="mono text-xs text-[var(--ink-faint)]">{endpoint.path}</span>
          </span>
          {meta && (
            <span className="mono text-xs text-[var(--ink-faint)]">
              {meta.status} · {meta.credits ?? 0} credits · {meta.ms ?? 0} ms
            </span>
          )}
        </div>
        <div className="sheet mt-1 h-[28rem] overflow-auto p-3 text-xs">
          {response ? (
            <JsonView value={response} />
          ) : (
            <p className="mono text-[var(--ink-faint)]">Send a request to see the response.</p>
          )}
        </div>
      </div>
    </div>
  );
}
