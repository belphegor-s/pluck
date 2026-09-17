import { randomUUID } from "node:crypto";
import { rateLimit } from "@pluck/runtime";
import { type Endpoint, type EndpointId, PluckError, endpoints, isPluckError } from "@pluck/shared";
import { type Context, Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { z } from "zod";
import { type Caller, KeyAuthenticator } from "./auth.js";
import type { HandlerMap } from "./handler.js";
import * as jobs from "./handlers/jobs.js";
import * as intel from "./handlers/intel.js";
import * as scrape from "./handlers/scrape.js";
import type { Services } from "./services.js";

const handlers: HandlerMap = {
  scrape: scrape.scrape,
  parse: scrape.parse,
  map: scrape.map,
  screenshot: scrape.screenshot,
  crawlStart: jobs.crawlStart,
  crawlGet: jobs.crawlGet,
  crawlCancel: jobs.crawlCancel,
  search: intel.search,
  extract: intel.extract,
  product: intel.product,
  products: intel.products,
  styleguide: intel.styleguide,
  brand: intel.brand,
  classify: intel.classify,
  transaction: intel.transaction,
  monitorCreate: jobs.monitorCreate,
  monitorList: jobs.monitorList,
  monitorGet: jobs.monitorGet,
  monitorUpdate: jobs.monitorUpdate,
  monitorDelete: jobs.monitorDelete,
  monitorChanges: jobs.monitorChangesList,
  usage: jobs.usage,
};

export type AppEnv = { Variables: { requestId: string; caller?: Caller } };

export function errorResponse(c: Context, err: unknown, requestId: string, log: Services["log"]) {
  if (err instanceof z.ZodError) {
    return c.json(
      {
        error: {
          code: "bad_request",
          message: err.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "),
          requestId,
          details: err.issues,
        },
      },
      400,
    );
  }
  if (isPluckError(err)) {
    return c.json({ error: { code: err.code, message: err.message, requestId, details: err.details } }, err.status as ContentfulStatusCode);
  }
  log.error({ err, requestId }, "unhandled error");
  return c.json({ error: { code: "internal", message: "Something went wrong on our side.", requestId } }, 500);
}

/** Builds `/v1/*` routes from the shared endpoint registry. */
export function v1Router(s: Services) {
  const app = new Hono<AppEnv>();
  const auth = new KeyAuthenticator(s);
  void auth.ensureOwner().catch((err: unknown) => s.log.error({ err }, "failed to create owner account"));

  for (const [id, endpoint] of Object.entries(endpoints) as [EndpointId, Endpoint][]) {
    const h = handlers[id] as unknown as HandlerMap["scrape"];
    const path = endpoint.path.replace(/^\/v1/, "").replace(/\{(\w+)\}/g, ":$1");

    app.on(endpoint.method.toUpperCase(), path, async (c) => {
      const started = performance.now();
      const requestId = c.get("requestId") ?? randomUUID();
      let caller: Caller | null = null;
      let reserved = 0;
      let status = 200;
      let spent = 0;
      let cached = false;
      let target: string | undefined;

      try {
        caller = await auth.authenticate(c.req.header("authorization") ?? c.req.header("x-api-key"));
        c.set("caller", caller);

        const limit = await rateLimit(s.cacheRedis, caller.apiKeyId ?? caller.userId, s.config.RATE_LIMIT_PER_MINUTE);
        if (Number.isFinite(limit.remaining)) {
          c.header("x-ratelimit-limit", String(s.config.RATE_LIMIT_PER_MINUTE));
          c.header("x-ratelimit-remaining", String(limit.remaining));
          c.header("x-ratelimit-reset", String(limit.reset));
        }
        if (!limit.allowed) throw new PluckError("rate_limited", "Rate limit exceeded. Slow down or contact us for higher limits.");

        let raw: Record<string, unknown> = {};
        if (endpoint.body) {
          const text = await c.req.text();
          if (text.length > 45_000_000) throw new PluckError("bad_request", "Request body too large.");
          try {
            raw = text ? (JSON.parse(text) as Record<string, unknown>) : {};
          } catch {
            throw new PluckError("bad_request", "Request body must be valid JSON.");
          }
          raw = endpoint.body.parse(raw) as Record<string, unknown>;
        }
        if (endpoint.query) Object.assign(raw, endpoint.query.parse(c.req.query()));
        if (endpoint.params) Object.assign(raw, endpoint.params.parse(c.req.param()));

        const input = raw as never;
        target = h.target?.(input);
        reserved = h.estimate(input);
        await s.credits.reserve(caller.userId, reserved);

        const llm = s.llm.tasks(caller.userId, {
          provider: c.req.header("x-llm-provider"),
          key: c.req.header("x-llm-key"),
          model: c.req.header("x-llm-model"),
          baseUrl: c.req.header("x-llm-base-url"),
        });

        const result = await h.run({ s, caller, requestId, llm, signal: c.req.raw.signal }, input);
        spent = result.credits;
        cached = result.cached ?? false;
        status = result.status ?? 200;
        await s.credits.settle(caller.userId, reserved, spent);
        reserved = 0;

        const durationMs = Math.round(performance.now() - started);
        c.header("x-credits-used", String(spent));
        return c.json(
          { data: result.data, meta: { requestId, creditsUsed: spent, cached, durationMs } },
          status as ContentfulStatusCode,
        );
      } catch (err) {
        if (caller && reserved > 0) await s.credits.settle(caller.userId, reserved, 0).catch(() => {});
        spent = 0;
        const res = errorResponse(c, err, requestId, s.log);
        status = res.status;
        return res;
      } finally {
        if (caller) {
          s.usage.record({
            userId: caller.userId,
            apiKeyId: caller.apiKeyId,
            requestId,
            endpoint: id,
            status,
            credits: spent,
            durationMs: Math.round(performance.now() - started),
            cached,
            target: target ?? null,
          });
        }
      }
    });
  }
  return app;
}
