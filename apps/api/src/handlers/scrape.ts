import { mapSite, parseDocumentBytes, sha256 } from "@pluck/core";
import {
  credits,
  PluckError,
  type ScrapeRequest,
  type ScrapeResult,
  scrapeCost,
} from "@pluck/shared";
import { handler } from "../handler.js";

const cacheKey = (kind: string, value: unknown) => `${kind}:${sha256(JSON.stringify(value))}`;

/** Requests carrying custom headers (cookies, auth) or actions are never shared from cache. */
const cacheable = (req: ScrapeRequest) => !req.headers && !req.actions?.length;

const estimateScrape = (req: ScrapeRequest) =>
  scrapeCost({
    browser:
      req.render === "always" || req.formats.includes("screenshot") || Boolean(req.actions?.length),
    residential: req.proxy === "residential",
    screenshot: req.formats.includes("screenshot"),
    llm: req.formats.includes("json") ? "instance" : null,
  });

export const scrape = handler("scrape", {
  estimate: estimateScrape,
  target: (i) => i.url,
  async run({ s, llm, caller }, req) {
    const { maxAge, timeout: _t, ...identity } = req;
    const key = cacheKey("scrape", identity);
    if (maxAge > 0 && cacheable(req)) {
      const hit = await s.cache.get<ScrapeResult>(key);
      if (hit && Date.now() - hit.storedAt <= maxAge * 1000) {
        return { data: hit.value, credits: credits.scrape, cached: true };
      }
    }

    const scraper = await s.scraperFor(caller.userId, llm);
    const { result, usage } = await scraper.scrape(req);
    if (cacheable(req) && result.metadata.statusCode < 400) {
      void s.cache.set(key, result, Math.max(maxAge, 3_600)).catch(() => {});
    }
    return { data: result, credits: scrapeCost(usage) };
  },
});

export const parse = handler("parse", {
  estimate: () => credits.parse,
  target: (i) => i.url ?? i.filename,
  async run({ s }, req) {
    let body: Buffer;
    let contentType = req.contentType ?? null;
    if (req.url) {
      const res = await s.http.fetch(req.url, { timeout: 60_000, maxBytes: 50 * 1024 * 1024 });
      if (res.status >= 400)
        throw new PluckError("target_unreachable", `Document responded with HTTP ${res.status}.`);
      body = res.body;
      contentType ??= res.contentType;
    } else {
      body = Buffer.from(req.base64!, "base64");
    }
    const data = await parseDocumentBytes(body, {
      contentType,
      filename: req.filename ?? req.url?.split("/").pop(),
    });
    const pageCredits = data.pages ? Math.floor(data.pages / 10) * credits.parsePerTenPages : 0;
    return { data, credits: credits.parse + pageCredits };
  },
});

export const map = handler("map", {
  estimate: () => credits.map,
  target: (i) => i.url,
  async run({ s }, req) {
    const key = cacheKey("map", req);
    const hit = await s.cache.get<Awaited<ReturnType<typeof mapSite>>>(key);
    if (hit && Date.now() - hit.storedAt < 3_600_000)
      return { data: hit.value, credits: credits.map, cached: true };
    const data = await mapSite(s.http, s.robots, req);
    void s.cache.set(key, data, 3_600).catch(() => {});
    return { data, credits: credits.map };
  },
});

export const screenshot = handler("screenshot", {
  estimate: (i) =>
    credits.scrape +
    credits.browserRender +
    credits.screenshot +
    (i.proxy === "residential" ? credits.residentialProxy : 0),
  target: (i) => i.url,
  async run({ s, caller }, req) {
    const { maxAge, timeout: _t, ...identity } = req;
    const key = cacheKey("shot", identity);
    type Shot = {
      url: string;
      screenshot: string;
      width: number;
      height: number;
      format: "png" | "jpeg" | "webp";
    };
    if (maxAge > 0 && s.store) {
      const hit = await s.cache.get<Shot>(key);
      if (hit && Date.now() - hit.storedAt <= maxAge * 1000)
        return { data: hit.value, credits: credits.scrape, cached: true };
    }

    const scraper = await s.scraperFor(caller.userId);
    const { result, usage } = await scraper.scrape({
      url: req.url,
      formats: ["screenshot"],
      screenshot: {
        fullPage: req.fullPage,
        format: req.format,
        quality: req.quality,
        viewport: req.viewport,
      },
      waitFor: req.waitFor,
      actions: req.actions,
      proxy: req.proxy,
      timeout: req.timeout,
      render: "always",
      onlyMainContent: false,
      blockAds: true,
      respectRobots: false,
      mobile: false,
      maxAge: 0,
    });
    if (!result.screenshot)
      throw new PluckError("target_unreachable", "The page could not be captured.");
    const data: Shot = {
      url: result.metadata.finalUrl,
      screenshot: result.screenshot,
      width: req.viewport?.width ?? 1440,
      height: req.viewport?.height ?? 900,
      format: req.format,
    };
    if (s.store) void s.cache.set(key, data, Math.max(maxAge, 3_600)).catch(() => {});
    return { data, credits: scrapeCost(usage) };
  },
});
