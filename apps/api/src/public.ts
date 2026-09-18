import { users } from "@pluck/db";
import { rateLimit } from "@pluck/runtime";
import {
  BRAND,
  buildOpenApi,
  creditPacks,
  domain as domainSchema,
  logoQuery,
  PluckError,
} from "@pluck/shared";
import { validateEvent, WebhookVerificationError } from "@polar-sh/sdk/webhooks";
import { Scalar } from "@scalar/hono-api-reference";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import sharp from "sharp";
import type { AppEnv } from "./router.js";
import { errorResponse } from "./router.js";
import { BrandService } from "./services/brand.js";
import type { Services } from "./services.js";

const VERSION = process.env.npm_package_version ?? "0.1.0";

export function publicRouter(s: Services) {
  const app = new Hono<AppEnv>();

  app.get("/health", async (c) => {
    const checks = await Promise.allSettled([s.db.$client`select 1`, s.queueRedis.ping()]);
    const ok = checks.every((r) => r.status === "fulfilled");
    return c.json({ status: ok ? "ok" : "degraded", version: VERSION }, ok ? 200 : 503);
  });

  let spec: unknown;
  app.get("/openapi.json", (c) => {
    spec ??= buildOpenApi({
      serverUrl: s.config.PUBLIC_API_URL,
      version: VERSION,
      billing: s.config.BILLING_ENABLED,
    });
    c.header("cache-control", "public, max-age=300");
    return c.json(spec as object);
  });

  app.get(
    "/docs",
    Scalar({
      url: "/openapi.json",
      pageTitle: `${BRAND.name} API Reference`,
      favicon: `${s.config.PUBLIC_WEB_URL}/icon.svg`,
      theme: "none",
      hideModels: false,
      defaultHttpClient: { targetKey: "js", clientKey: "fetch" },
      customCss: `:root{--scalar-font:"Geist",system-ui,sans-serif;--scalar-font-code:"Geist Mono",ui-monospace,monospace}.light-mode{--scalar-color-accent:#e5480d;--scalar-background-1:#faf9f6}.dark-mode{--scalar-color-accent:#ff6a2c;--scalar-background-1:#0c0c0b}`,
    }),
  );

  /**
   * Public logo CDN: `GET /v1/logo/stripe.com?size=128`. No API key, cached
   * aggressively at the edge. Rate limited per IP to stop enumeration abuse.
   */
  app.get("/v1/logo/:domain", async (c) => {
    const requestId = c.get("requestId");
    try {
      const ip =
        c.req.header("cf-connecting-ip") ??
        c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
        "anon";
      const limit = await rateLimit(s.cacheRedis, `logo:${ip}`, 600);
      if (!limit.allowed) throw new PluckError("rate_limited", "Too many logo requests.");

      const domain = domainSchema.parse(c.req.param("domain"));
      const q = logoQuery.parse(c.req.query());
      const format = q.format === "svg" ? "png" : (q.format ?? "webp");
      const key = `logos/${domain}/${q.size}.${format}`;

      let bytes = s.store ? (await s.store.get(key).catch(() => null))?.body : undefined;
      if (!bytes) {
        bytes = await renderLogo(s, domain, q.size, format).catch(() => undefined);
        if (!bytes) {
          if (q.fallback === "404") throw new PluckError("not_found", "No logo found.");
          bytes = await monogram(domain, q.size, format);
        } else if (s.store) {
          void s.store.put(key, bytes, `image/${format}`).catch(() => {});
        }
      }
      return c.body(new Uint8Array(bytes), 200, {
        "content-type": `image/${format}`,
        "cache-control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000",
        "access-control-allow-origin": "*",
      });
    } catch (err) {
      return errorResponse(c, err, requestId, s.log);
    }
  });

  /** Polar: credit packs are one-time products; `order.paid` grants credits idempotently. */
  app.post("/webhooks/polar", async (c) => {
    if (!s.config.POLAR_WEBHOOK_SECRET) return c.json({ error: "billing disabled" }, 404);
    const body = await c.req.text();
    let event: ReturnType<typeof validateEvent>;
    try {
      event = validateEvent(
        body,
        Object.fromEntries(c.req.raw.headers),
        s.config.POLAR_WEBHOOK_SECRET,
      );
    } catch (err) {
      if (err instanceof WebhookVerificationError)
        return c.json({ error: "invalid signature" }, 403);
      throw err;
    }

    if (event.type === "order.paid") {
      const order = event.data;
      const userId = order.customer.externalId ?? (order.metadata?.userId as string | undefined);
      const packId =
        (order.product?.metadata?.pack as string | undefined) ??
        (order.metadata?.pack as string | undefined);
      const pack = creditPacks.find((p) => p.id === packId);
      if (!userId || !pack) {
        s.log.error({ orderId: order.id, userId, packId }, "polar order without user or pack");
        return c.json({ ok: false }, 202);
      }
      const [user] = await s.db.select({ id: users.id }).from(users).where(eq(users.id, userId));
      if (!user) return c.json({ ok: false, reason: "unknown user" }, 202);
      const granted = await s.credits.grant(
        userId,
        pack.credits,
        "purchase",
        `polar:${order.id}`,
        order.totalAmount,
      );
      s.log.info(
        { orderId: order.id, userId, credits: pack.credits, granted },
        "credits purchased",
      );
    }
    return c.json({ ok: true });
  });

  return app;
}

async function renderLogo(s: Services, domain: string, size: number, format: "png" | "webp") {
  const { brand } = await new BrandService(s).get(domain, {
    maxAge: 2_592_000,
    proxy: "auto",
    llm: null,
  });
  const ranked = [...brand.logos].sort((a, b) => score(b) - score(a));
  for (const logo of ranked.slice(0, 4)) {
    try {
      const res = await s.http.fetch(logo.url, { timeout: 8_000, maxBytes: 5 * 1024 * 1024 });
      if (res.status >= 400 || res.body.length < 64) continue;
      const img = sharp(res.body, { density: 300, failOn: "none" }).resize(size, size, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      });
      return await (format === "png" ? img.png() : img.webp({ quality: 90 })).toBuffer();
    } catch {
      // Try the next candidate.
    }
  }
  return undefined;
}

/** Square icons first (apple-touch, large favicons, manifest icons), wide header logos last. */
function score(l: { type: string; format: string | null; width: number | null }) {
  const typeScore = { "apple-touch-icon": 50, icon: 30, symbol: 45, logo: 10, og: 0 }[l.type] ?? 0;
  return (
    typeScore +
    (l.format === "svg" ? 25 : 0) +
    Math.min(l.width ?? 32, 512) / 20 -
    (l.format === "ico" ? 15 : 0)
  );
}

async function monogram(domain: string, size: number, format: "png" | "webp") {
  const letter = domain[0]!.toUpperCase();
  let hash = 0;
  for (const ch of domain) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = hash % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="hsl(${hue} 55% 42%)"/><text x="50" y="50" dy=".35em" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-weight="600" font-size="52" fill="#fff">${letter}</text></svg>`;
  const img = sharp(Buffer.from(svg));
  return (format === "png" ? img.png() : img.webp({ quality: 90 })).toBuffer();
}
