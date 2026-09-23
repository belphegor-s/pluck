import {
  decodeBody,
  extractBrandFromHtml,
  mapConcurrent,
  parseDocument,
  productsFromStructuredData,
  type styleguideProbe,
  withDeadline,
} from "@pluck/core";
import {
  credits,
  llmCost,
  PluckError,
  type ScrapeResult,
  type SearchHit,
  scrapeCost,
} from "@pluck/shared";
import { handler } from "../handler.js";
import { BrandService } from "../services/brand.js";

/* ----------------------------------------------------------------- search */

/** Reading search results, all of them together. */
const SEARCH_READ_BUDGET_MS = 30_000;
/** Results read at once — enough to overlap network waits, not enough to flood the render pool. */
const SEARCH_READ_CONCURRENCY = 4;

/** What is left of a budget that started at `started`, never negative. */
const remainingMs = (budget: AbortSignal, total: number, started: number) =>
  budget.aborted ? 0 : Math.max(0, total - (Date.now() - started));

export const search = handler("search", {
  estimate: (i) => credits.search + (i.scrape ? i.limit * credits.scrape : 0),
  target: (i) => i.query,
  async run({ s, caller, signal }, req) {
    const hits = await s.search.search(req);
    const started = Date.now();
    if (!req.scrape) return { data: { results: hits }, credits: credits.search };

    const scraper = await s.scraperFor(caller.userId);
    let spent = credits.search;
    const opts = req.scrape;

    /*
      Reading the results is where search used to run for minutes: each result
      could walk every proxy tier and then the browser, and all of them started
      at once against a small render pool. Now the reading phase has one budget,
      a bounded number in flight, and an abort signal that stops the work rather
      than merely abandoning it. A result that runs out of time comes back
      without `page` — the caller still gets every hit, just not every page.
    */
    const budget = AbortSignal.any([signal, AbortSignal.timeout(SEARCH_READ_BUDGET_MS)]);
    let unread = 0;
    const results: SearchHit[] = await mapConcurrent(hits, SEARCH_READ_CONCURRENCY, async (hit) => {
      if (budget.aborted) {
        unread++;
        return hit;
      }
      try {
        const outcome = await withDeadline(
          scraper.scrape(
            {
              url: hit.url,
              formats: opts.formats.filter((f) => f !== "json" && f !== "screenshot"),
              onlyMainContent: opts.onlyMainContent,
              render: opts.render,
              proxy: opts.proxy,
              timeout: Math.min(opts.timeout, 15_000),
              maxAge: opts.maxAge,
              blockAds: true,
              respectRobots: true,
              mobile: false,
            },
            { signal: budget },
          ),
          // A browser render in flight cannot be recalled from the queue, so the
          // wait is capped as well as the work.
          remainingMs(budget, SEARCH_READ_BUDGET_MS, started),
          () => null,
        );
        if (!outcome) {
          unread++;
          return hit;
        }
        spent += scrapeCost(outcome.usage);
        return { ...hit, page: outcome.result as Partial<ScrapeResult> };
      } catch {
        return hit;
      }
    });
    return {
      data: {
        results,
        ...(unread
          ? { warnings: [`${unread} result(s) were not read within the time budget.`] }
          : {}),
      },
      credits: spent,
    };
  },
});

/* ---------------------------------------------------------------- extract */

export const extract = handler("extract", {
  estimate: () => credits.scrape + credits.llm,
  target: (i) => i.url,
  async run({ s, llm, caller }, req) {
    const scraper = await s.scraperFor(caller.userId, llm);
    const { result, usage } = await scraper.scrape({
      url: req.url,
      formats: ["json"],
      jsonOptions: { schema: req.schema, prompt: req.prompt, llm: req.llm },
      render: req.render,
      proxy: req.proxy,
      maxAge: req.maxAge,
      onlyMainContent: false,
      blockAds: true,
      respectRobots: true,
      mobile: false,
      timeout: 45_000,
    });
    return {
      data: { url: result.metadata.finalUrl, data: result.json },
      credits: scrapeCost(usage),
    };
  },
});

async function loadPage(
  s: Parameters<(typeof extract)["run"]>[0]["s"],
  userId: string,
  url: string,
  proxy: "auto" | "none" | "datacenter" | "residential",
  maxAge: number,
) {
  const scraper = await s.scraperFor(userId);
  const { result, usage } = await scraper.scrape({
    url,
    formats: ["markdown", "rawHtml"],
    onlyMainContent: false,
    render: "auto",
    proxy,
    maxAge,
    blockAds: true,
    respectRobots: true,
    mobile: false,
    timeout: 45_000,
  });
  return { result, usage, doc: parseDocument(result.rawHtml ?? "") };
}

export const product = handler("product", {
  estimate: () => credits.extractProduct,
  target: (i) => i.url,
  async run({ s, llm, caller }, req) {
    const { result, usage, doc } = await loadPage(s, caller.userId, req.url, req.proxy, req.maxAge);
    const structured = productsFromStructuredData(doc, result.metadata.finalUrl);
    const base = credits.extractProduct + scrapeCost(usage) - credits.scrape;
    if (structured[0])
      return {
        data: { product: structured[0], source: "structured-data" as const },
        credits: base,
      };

    const { products, billing } = await llm.products(
      result.metadata.finalUrl,
      result.markdown ?? "",
      1,
      req.llm,
    );
    return {
      data: { product: products[0] ?? null, source: "llm" as const },
      credits: base + llmCost(billing),
    };
  },
});

export const products = handler("products", {
  estimate: () => credits.extractProduct,
  target: (i) => i.url,
  async run({ s, llm, caller }, req) {
    const { result, usage, doc } = await loadPage(s, caller.userId, req.url, req.proxy, req.maxAge);
    const structured = productsFromStructuredData(doc, result.metadata.finalUrl);
    const base = credits.extractProduct + scrapeCost(usage) - credits.scrape;
    if (structured.length > 1) {
      return {
        data: { products: structured.slice(0, req.limit), source: "structured-data" as const },
        credits: base,
      };
    }
    const { products: found, billing } = await llm.products(
      result.metadata.finalUrl,
      result.markdown ?? "",
      req.limit,
      req.llm,
    );
    return { data: { products: found, source: "llm" as const }, credits: base + llmCost(billing) };
  },
});

export const styleguide = handler("styleguide", {
  estimate: (i) => credits.styleguide + (i.proxy === "residential" ? credits.residentialProxy : 0),
  target: (i) => i.url,
  async run({ s }, req) {
    const key = `styleguide:${req.url}:${req.proxy}`;
    type Guide = ReturnType<typeof styleguideProbe> & { url: string };
    if (req.maxAge > 0) {
      const hit = await s.cache.get<Guide>(key);
      if (hit && Date.now() - hit.storedAt <= req.maxAge * 1000)
        return { data: hit.value, credits: credits.scrape, cached: true };
    }
    const rendered = await s.renderer.render({
      url: req.url,
      proxy: s.http.proxies.ladder(req.proxy)[0] ?? "none",
      timeout: 45_000,
      blockAds: true,
      evaluate: "styleguide",
    });
    if (!rendered.evaluated)
      throw new PluckError("target_unreachable", "Could not compute styles for this page.");
    const data = {
      url: rendered.finalUrl,
      ...(rendered.evaluated as ReturnType<typeof styleguideProbe>),
    };
    void s.cache.set(key, data, Math.max(req.maxAge, 86_400)).catch(() => {});
    return {
      data,
      credits: credits.styleguide + (req.proxy === "residential" ? credits.residentialProxy : 0),
    };
  },
});

/* ------------------------------------------------------------------ brand */

export const brand = handler("brand", {
  estimate: () => credits.brand,
  target: (i) => i.domain ?? i.email ?? i.name ?? i.ticker,
  async run(ctx, req) {
    const svc = new BrandService(ctx.s);
    const domain = await svc.resolveDomain(req);
    const { brand, cached } = await svc.get(domain, {
      maxAge: req.maxAge,
      proxy: req.proxy,
      llm: ctx.llm,
    });
    return { data: brand, credits: cached ? 2 : credits.brand, cached };
  },
});

export const classify = handler("classify", {
  estimate: () => credits.classify + credits.llm,
  target: (i) => i.domain,
  async run({ s, llm }, req) {
    let content: string | undefined;
    let spent = credits.classify;
    if (req.domain && !req.description) {
      const res = await s.http
        .fetch(`https://${req.domain}`, { timeout: 15_000 })
        .catch(() => null);
      if (res && res.status < 400) {
        const doc = parseDocument(decodeBody(res.body, res.contentType));
        const b = extractBrandFromHtml(doc, res.finalUrl);
        content = [b.name, b.title, b.description].filter(Boolean).join("\n");
        spent += credits.scrape;
      }
    }
    const { data, billing } = await llm.classify(
      { domain: req.domain, description: req.description, content },
      req.llm,
    );
    return { data, credits: spent + llmCost(billing) };
  },
});

export const transaction = handler("transaction", {
  estimate: () => credits.transaction + credits.llm,
  target: (i) => i.descriptor,
  async run(ctx, req) {
    const { data, billing } = await ctx.llm.transaction(req, req.llm);
    let brandProfile = null;
    if (data.domain && data.confidence >= 0.5) {
      const svc = new BrandService(ctx.s);
      brandProfile = await svc
        .get(data.domain.replace(/^https?:\/\//, "").replace(/\/.*$/, ""), {
          maxAge: 2_592_000,
          proxy: "auto",
          llm: null,
        })
        .then((r) => r.brand)
        .catch(() => null);
    }
    return {
      data: { ...data, brand: brandProfile },
      credits: credits.transaction + llmCost(billing),
    };
  },
});
