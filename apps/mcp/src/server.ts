import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { BRAND, type Endpoint, endpoints } from "@pluck/shared";
import { z } from "zod";

const t = BRAND.tool;
const INSTRUCTIONS = `${BRAND.name} gives you the live web as clean, LLM-ready context.
- ${t("search")}: find pages. Set scrape to get their content in one call.
- ${t("scrape")}: read one URL as markdown (JS rendered automatically).
- ${t("map")}: list every URL on a site before crawling.
- ${t("crawl")} then ${t("crawl_status")}: read a whole site or section.
- ${t("extract")}: structured JSON from a page against a JSON schema.
- ${t("brand")} / ${t("styleguide")}: company profile, logos, colors, fonts and design tokens.
Prefer map + targeted scrapes over large crawls. Keep crawl limits small.`;

type McpEndpoint = Endpoint & { mcp: NonNullable<Endpoint["mcp"]> };

const tools = (Object.values(endpoints) as Endpoint[]).filter((e): e is McpEndpoint =>
  Boolean(e.mcp),
);

function inputSchema(e: Endpoint): Record<string, unknown> {
  const merged: { type: "object"; properties: Record<string, unknown>; required: string[] } = {
    type: "object",
    properties: {},
    required: [],
  };
  for (const schema of [e.body, e.query, e.params]) {
    if (!schema) continue;
    let json = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as {
      properties?: Record<string, unknown>;
      required?: string[];
      $ref?: string;
      $defs?: Record<string, { properties?: Record<string, unknown>; required?: string[] }>;
    };
    if (json.$ref?.startsWith("#/$defs/")) json = { ...json, ...json.$defs?.[json.$ref.slice(8)] };
    Object.assign(merged.properties, json.properties);
    merged.required.push(...(json.required ?? []));
  }
  return merged;
}

export interface ApiClientOptions {
  apiUrl: string;
  apiKey: string;
  llmHeaders?: Record<string, string>;
}

export function createMcpServer(opts: ApiClientOptions): Server {
  const server = new Server(
    { name: BRAND.slug, title: BRAND.name, version: "0.1.0", websiteUrl: BRAND.siteUrl },
    { capabilities: { tools: {} }, instructions: INSTRUCTIONS },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((e) => ({
      name: e.mcp.name,
      title: e.summary,
      description: `${e.description}\n\nCost: ${e.cost}`,
      inputSchema: inputSchema(e) as { type: "object" },
      annotations: {
        readOnlyHint: e.mcp.readOnly,
        openWorldHint: true,
        idempotentHint: e.method === "get",
      },
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const e = tools.find((t) => t.mcp.name === request.params.name);
    if (!e)
      return {
        isError: true,
        content: [{ type: "text", text: `Unknown tool ${request.params.name}` }],
      };

    const args = { ...(request.params.arguments ?? {}) } as Record<string, unknown>;
    let path = e.path;
    for (const key of Object.keys(e.params?.shape ?? {})) {
      path = path.replace(`{${key}}`, encodeURIComponent(String(args[key] ?? "")));
      delete args[key];
    }
    const url = new URL(path, opts.apiUrl);
    if (e.method === "get") {
      for (const [k, v] of Object.entries(args))
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }

    const res = await fetch(url, {
      method: e.method.toUpperCase(),
      headers: {
        authorization: `Bearer ${opts.apiKey}`,
        "content-type": "application/json",
        "user-agent": `${BRAND.slug}-mcp/0.1`,
        ...opts.llmHeaders,
      },
      body: e.method === "get" ? undefined : JSON.stringify(args),
      signal: AbortSignal.timeout(170_000),
    });
    const payload = (await res.json().catch(() => null)) as {
      data?: unknown;
      error?: { message: string };
    } | null;
    if (!res.ok || !payload || payload.error) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: payload?.error?.message ?? `${BRAND.name} API error (HTTP ${res.status})`,
          },
        ],
      };
    }
    return {
      content: [{ type: "text", text: render(e.id, payload.data) }],
      structuredContent: toStructured(payload.data),
    };
  });

  return server;
}

/** Markdown-first text for models; the full object stays in structuredContent. */
function render(id: string, data: unknown): string {
  const d = data as Record<string, unknown>;
  if (id === "scrape" && typeof d.markdown === "string") {
    const meta = d.metadata as { title?: string; finalUrl?: string } | undefined;
    return `# ${meta?.title ?? ""}\nSource: ${meta?.finalUrl ?? ""}\n\n${d.markdown}`;
  }
  if (id === "search" && Array.isArray(d.results)) {
    return (
      d.results as { title: string; url: string; snippet: string; page?: { markdown?: string } }[]
    )
      .map(
        (r, i) =>
          `## ${i + 1}. ${r.title}\n${r.url}\n${r.snippet}${r.page?.markdown ? `\n\n${r.page.markdown}` : ""}`,
      )
      .join("\n\n");
  }
  return JSON.stringify(data, null, 2);
}

const toStructured = (data: unknown) =>
  data && typeof data === "object" && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : { result: data };
