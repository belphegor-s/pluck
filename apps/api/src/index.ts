import { randomUUID } from "node:crypto";
import { serve } from "@hono/node-server";
import { installProcessHandlers, loadConfig } from "@pluck/runtime";
import { BRAND } from "@pluck/shared";
import { Hono } from "hono";
import { compress } from "hono/compress";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { publicRouter } from "./public.js";
import { type AppEnv, errorResponse, v1Router } from "./router.js";
import { createServices } from "./services.js";

const config = loadConfig();
const s = await createServices(config);
const port = Number(process.env.PORT ?? 8080);

const app = new Hono<AppEnv>();

app.use("*", async (c, next) => {
  const id = c.req.header("x-request-id")?.slice(0, 64) || randomUUID();
  c.set("requestId", id);
  c.header("x-request-id", id);
  await next();
});
app.use("*", secureHeaders({ crossOriginResourcePolicy: "cross-origin" }));
app.use(
  "*",
  cors({
    origin: "*",
    allowHeaders: [
      "authorization",
      "content-type",
      "x-api-key",
      "x-llm-provider",
      "x-llm-key",
      "x-llm-model",
      "x-llm-base-url",
      "x-request-id",
    ],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    exposeHeaders: [
      "x-request-id",
      "x-credits-used",
      "x-ratelimit-limit",
      "x-ratelimit-remaining",
      "x-ratelimit-reset",
    ],
    maxAge: 86_400,
  }),
);
app.use("*", compress());

app.get("/", (c) =>
  c.json({
    name: `${BRAND.name} API`,
    docs: `${config.PUBLIC_API_URL}/docs`,
    openapi: `${config.PUBLIC_API_URL}/openapi.json`,
    website: config.PUBLIC_WEB_URL,
  }),
);
app.route("/", publicRouter(s));
app.route("/v1", v1Router(s));

app.notFound((c) =>
  c.json(
    { error: { code: "not_found", message: `No route for ${c.req.method} ${c.req.path}` } },
    404,
  ),
);
app.onError((err, c) => errorResponse(c, err, c.get("requestId"), s));

const server = serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, (info) => {
  s.log.info({ port: info.port }, "pluck api listening");
});

installProcessHandlers(s.errors, async () => {
  await s.close().catch(() => {});
});

// Long crawls are async; the slowest sync call is a browser render + LLM.
server.setTimeout(180_000);
(server as unknown as { keepAliveTimeout: number }).keepAliveTimeout = 65_000;

let shuttingDown = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    s.log.info({ signal }, "shutting down");
    server.close(async () => {
      await s.close().catch(() => {});
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 25_000).unref();
  });
}
