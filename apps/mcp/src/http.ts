import { serve } from "@hono/node-server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { BRAND } from "@pluck/shared";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createMcpServer } from "./server.js";

const apiUrl =
  process.env.PLUCK_API_INTERNAL_URL ?? process.env.PUBLIC_API_URL ?? "http://localhost:8080";
const KEY_HINT = `${BRAND.apiKeyLive}…`;
const app = new Hono();

app.use(
  "*",
  cors({
    origin: "*",
    allowHeaders: [
      "authorization",
      "content-type",
      "mcp-session-id",
      "mcp-protocol-version",
      "x-llm-provider",
      "x-llm-key",
      "x-llm-model",
    ],
    exposeHeaders: ["mcp-session-id"],
  }),
);

app.get("/", (c) =>
  c.json({ name: `${BRAND.name} MCP`, endpoint: "/mcp", docs: `${BRAND.siteUrl}/docs/mcp` }),
);
app.get("/health", (c) => c.json({ status: "ok" }));

/**
 * Stateless streamable HTTP: every request gets its own server bound to the
 * caller's API key, so instances scale horizontally with no sticky sessions.
 */
app.all("/mcp", async (c) => {
  const auth = c.req.header("authorization")?.replace(/^Bearer\s+/i, "") ?? c.req.query("apiKey");
  if (!auth) {
    return c.json(
      {
        jsonrpc: "2.0",
        error: { code: -32001, message: `Missing API key. Send Authorization: Bearer ${KEY_HINT}` },
        id: null,
      },
      401,
    );
  }
  const llmHeaders: Record<string, string> = {};
  for (const h of ["x-llm-provider", "x-llm-key", "x-llm-model"]) {
    const v = c.req.header(h);
    if (v) llmHeaders[h] = v;
  }
  const server = createMcpServer({ apiUrl, apiKey: auth, llmHeaders });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(c.req.raw);
  } finally {
    void server.close();
  }
});

const port = Number(process.env.PORT ?? 8081);
serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, (info) =>
  console.log(`pluck mcp listening on ${info.port}`),
);
