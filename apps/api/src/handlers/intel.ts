import { decodeBody, extractBrandFromHtml, parseDocument, productsFromStructuredData, styleguideProbe } from "@pluck/core";
import { PluckError, type ScrapeResult, type SearchHit, credits, llmCost, scrapeCost } from "@pluck/shared";
import { handler } from "../handler.js";
import { BrandService } from "../services/brand.js";

/* ----------------------------------------------------------------- search */

export const search = handler("search", {
  estimate: (i) => credits.search + (i.scrape ? i.limit * credits.scrape : 0),
  target: (i) => i.query,
  async run({ s }, req) {
    const hits = await s.search.search(req);
    if (!req.scrape) return { data: { results: hits }, credits: credits.search };

    const scraper = s.scraper();
    let spent = credits.search;
    const opts = req.scrape;
    const results: SearchHit[] = await Promise.all(
      hits.map(async (hit) => {
        try {
          const { result, usage } = await scraper.scrape({
            url: hit.url,
            formats: opts.formats.filter((f) => f !== "json" && f !== "screenshot"),
            onlyMainContent: opts.onlyMainContent,
            render: opts.render,
            proxy: opts.proxy,
            timeout: Math.min(opts.timeout, 20_000),
            maxAge: opts.maxAge,
            blockAds: true,
            respectRobots: true,
            mobile: false,
          });
          spent += scrapeCost(usage);
          return { ...hit, page: result as Partial<ScrapeResult> };
        } catch {
          return hit;
        }
      }),
    );
    return { data: { results }, credits: spent };
  },
});

/* ---------------------------------------------------------------- extract */

export const extract = handler("extract", {
  estimate: () => credits.scrape + credits.llm,
  target: (i) => i.url,
  async run({ s, llm }, req) {
    const { result, usage } = await s.scraper(llm).scrape({
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
    return { data: { url: result.metadata.finalUrl, data: result.json }, credits: scrapeCost(usage) };
  },
});

async function loadPage(s: Parameters<(typeof extract)["run"]>[0]["s"], url: string, proxy: "auto" | "none" | "datacenter" | "residential", maxAge: number) {
  const { result, usage } = await s.scraper().scrape({
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
  async run({ s, llm }, req) {
    const { result, usage, doc } = await loadPage(s, req.url, req.proxy, req.maxAge);
    const structured = productsFromStructuredData(doc, result.metadata.finalUrl);
    const base = credits.extractProduct + scrapeCost(usage) - credits.scrape;
    if (structured[0]) return { data: { product: structured[0], source: "structured-data" as const }, credits: base };

    const { products, billing } = await llm.products(result.metadata.finalUrl, result.markdown ?? "", 1, req.llm);
    return { data: { product: products[0] ?? null, source: "llm" as const }, credits: base + llmCost(billing) };
  },
});

export const products = handler("products", {
  estimate: () => credits.extractProduct,
  target: (i) => i.url,
  async run({ s, llm }, req) {
    const { result, usage, doc } = await loadPage(s, req.url, req.proxy, req.maxAge);
    const structured = productsFromStructuredData(doc, result.metadata.finalUrl);
    const base = credits.extractProduct + scrapeCost(usage) - credits.scrape;
    if (structured.length > 1) {
      return { data: { products: structured.slice(0, req.limit), source: "structured-data" as const }, credits: base };
    }
    const { products: found, billing } = await llm.products(result.metadata.finalUrl, result.markdown ?? "", req.limit, req.llm);
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
      if (hit && Date.now() - hit.storedAt <= req.maxAge * 1000) return { data: hit.value, credits: credits.scrape, cached: true };
    }
    const rendered = await s.renderer.render({
      url: req.url,
      proxy: s.http.proxies.ladder(req.proxy)[0] ?? "none",
      timeout: 45_000,
      blockAds: true,
      evaluate: "styleguide",
    });
    if (!rendered.evaluated) throw new PluckError("target_unreachable", "Could not compute styles for this page.");
    const data = { url: rendered.finalUrl, ...(rendered.evaluated as ReturnType<typeof styleguideProbe>) };
    void s.cache.set(key, data, Math.max(req.maxAge, 86_400)).catch(() => {});
    return { data, credits: credits.styleguide + (req.proxy === "residential" ? credits.residentialProxy : 0) };
  },
});

/* ------------------------------------------------------------------ brand */

export const brand = handler("brand", {
  estimate: () => credits.brand,
  target: (i) => i.domain ?? i.email ?? i.name ?? i.ticker,
  async run(ctx, req) {
    const svc = new BrandService(ctx.s);
    const domain = await svc.resolveDomain(req);
    const { brand, cached } = await svc.get(domain, { maxAge: req.maxAge, proxy: req.proxy, llm: ctx.llm });
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
      const res = await s.http.fetch(`https://${req.domain}`, { timeout: 15_000 }).catch(() => null);
      if (res && res.status < 400) {
        const doc = parseDocument(decodeBody(res.body, res.contentType));
        const b = extractBrandFromHtml(doc, res.finalUrl);
        content = [b.name, b.title, b.description].filter(Boolean).join("\n");
        spent += credits.scrape;
      }
    }
    const { data, billing } = await llm.classify({ domain: req.domain, description: req.description, content }, req.llm);
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
        .get(data.domain.replace(/^https?:\/\//, "").replace(/\/.*$/, ""), { maxAge: 2_592_000, proxy: "auto", llm: null })
        .then((r) => r.brand)
        .catch(() => null);
    }
    return { data: { ...data, brand: brandProfile }, credits: credits.transaction + llmCost(billing) };
  },
});
