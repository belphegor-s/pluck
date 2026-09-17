import { createHash } from "node:crypto";
import { PluckError, type ScrapeRequest, type ScrapeResult } from "@pluck/shared";
import { cleanHtml, extractImages, extractLinks, htmlToMarkdown, htmlToText } from "./html/content.js";
import { needsJavaScript, isBlocked } from "./html/detect.js";
import { parseDocument } from "./html/document.js";
import { extractMetadata } from "./html/metadata.js";
import { type HttpClient, decodeBody } from "./net/fetch.js";
import type { ProxyUsed } from "./net/proxy.js";
import { assertPublicUrl } from "./net/ssrf.js";
import { detectKind, parseDocumentBytes } from "./parse/index.js";
import type { RobotsCache } from "./robots.js";
import type { AssetStore, LlmBilling, RenderResult, Renderer, StructuredExtractor } from "./types.js";

export interface ScraperDeps {
  http: HttpClient;
  robots: RobotsCache;
  renderer: Renderer;
  store?: AssetStore | null;
  extractor?: StructuredExtractor | null;
  allowPrivateNetwork: boolean;
}

export interface ScrapeOutcome {
  result: ScrapeResult;
  usage: { browser: boolean; residential: boolean; screenshot: boolean; llm: LlmBilling | null };
}

interface Page {
  finalUrl: string;
  status: number;
  contentType: string | null;
  html: string | null;
  markdown?: string;
  screenshot?: RenderResult["screenshot"];
  renderedWith: "http" | "browser";
  proxyUsed: ProxyUsed;
}

export class Scraper {
  constructor(private readonly deps: ScraperDeps) {}

  async scrape(req: ScrapeRequest): Promise<ScrapeOutcome> {
    const url = assertPublicUrl(req.url, this.deps.allowPrivateNetwork).href;
    if (req.respectRobots && !(await this.deps.robots.isAllowed(url))) {
      throw new PluckError("blocked_by_robots", "This URL is disallowed by the site's robots.txt. Set respectRobots to false if you have permission.");
    }

    const warnings: string[] = [];
    let page = await this.load(url, req, warnings);
    let { result, llm } = await this.format(url, page, req, warnings);

    // Safety net for pages the heuristic misjudged: substantial HTML, almost no content.
    if (
      req.render === "auto" &&
      page.renderedWith === "http" &&
      page.html &&
      page.html.length > 20_000 &&
      (result.markdown ?? htmlToText(page.html)).trim().length < 150
    ) {
      page = await this.load(url, { ...req, render: "always" }, warnings);
      ({ result, llm } = await this.format(url, page, req, warnings));
    }
    return {
      result,
      usage: {
        browser: page.renderedWith === "browser",
        residential: page.proxyUsed === "residential",
        screenshot: Boolean(result.screenshot),
        llm,
      },
    };
  }

  private async load(url: string, req: ScrapeRequest, warnings: string[]): Promise<Page> {
    const ladder = this.deps.http.proxies.ladder(req.proxy);
    const wantsBrowser =
      req.render === "always" ||
      req.formats.includes("screenshot") ||
      Boolean(req.actions?.length) ||
      Boolean(req.waitFor);

    let startTier = 0;
    let lastError: unknown;

    if (!wantsBrowser) {
      for (let i = 0; i < ladder.length; i++) {
        const proxy = ladder[i]!;
        try {
          const res = await this.deps.http.fetch(url, {
            proxy,
            timeout: req.timeout,
            headers: req.headers,
            country: req.country,
            mobile: req.mobile,
          });
          if (res.truncated) warnings.push("Response exceeded the size limit and was truncated.");

          const kind = detectKind(res.body, res.contentType);
          if (kind && kind !== "html") {
            const parsed = await parseDocumentBytes(res.body, { contentType: res.contentType });
            return { finalUrl: res.finalUrl, status: res.status, contentType: parsed.contentType, html: null, markdown: parsed.markdown, renderedWith: "http", proxyUsed: proxy };
          }

          const html = decodeBody(res.body, res.contentType);
          if (isBlocked(res.status, html)) {
            startTier = i + 1;
            lastError = new PluckError("target_blocked", `Blocked by the target site (HTTP ${res.status}).`);
            continue;
          }
          if (req.render === "never" || !needsJavaScript(parseDocument(html), html)) {
            return { finalUrl: res.finalUrl, status: res.status, contentType: res.contentType, html, renderedWith: "http", proxyUsed: proxy };
          }
          startTier = i;
          break;
        } catch (err) {
          lastError = err;
          if (err instanceof PluckError && (err.code === "forbidden" || err.code === "bad_request")) throw err;
          startTier = i + 1;
        }
      }
      if (req.render === "never") throw lastError ?? new PluckError("target_unreachable", "Could not fetch the page.");
    }

    // Browser path. When HTTP was blocked on every tier, still give the browser
    // one shot on the strongest tier: challenges often clear with real JS.
    const browserLadder = ladder.slice(Math.min(startTier, ladder.length - 1));
    for (const proxy of browserLadder) {
      try {
        const rendered = await this.deps.renderer.render({
          url,
          timeout: req.timeout,
          proxy,
          country: req.country,
          mobile: req.mobile,
          blockAds: req.blockAds,
          headers: req.headers,
          waitFor: req.waitFor,
          actions: req.actions,
          screenshot: req.formats.includes("screenshot")
            ? (req.screenshot ?? { fullPage: false, format: "webp", quality: 80 })
            : undefined,
        });
        if (isBlocked(rendered.status, rendered.html) && proxy !== browserLadder.at(-1)) {
          lastError = new PluckError("target_blocked", `Blocked by the target site (HTTP ${rendered.status}).`);
          continue;
        }
        return { ...rendered, renderedWith: "browser", proxyUsed: proxy };
      } catch (err) {
        lastError = err;
        if (err instanceof PluckError && (err.code === "forbidden" || err.code === "bad_request")) throw err;
      }
    }
    throw lastError ?? new PluckError("target_unreachable", "Could not load the page.");
  }

  private async format(
    url: string,
    page: Page,
    req: ScrapeRequest,
    warnings: string[],
  ): Promise<{ result: ScrapeResult; llm: LlmBilling | null }> {
    const f = new Set(req.formats);
    const doc = parseDocument(page.html ?? "<html><body></body></html>");
    const metadata = extractMetadata(doc, { url, finalUrl: page.finalUrl, statusCode: page.status, contentType: page.contentType });
    if (page.status >= 400) warnings.push(`Target responded with HTTP ${page.status}.`);

    let llm: LlmBilling | null = null;
    const out: ScrapeResult = {
      metadata,
      renderedWith: page.renderedWith,
      proxyUsed: page.proxyUsed,
      warnings,
    };

    let cleaned: string | null = null;
    const getCleaned = () =>
      (cleaned ??= page.html
        ? cleanHtml(doc, {
            baseUrl: page.finalUrl,
            onlyMainContent: req.onlyMainContent,
            includeTags: req.includeTags,
            excludeTags: req.excludeTags,
            blockAds: req.blockAds,
          })
        : "");

    let markdown: string | undefined;
    const getMarkdown = () => (markdown ??= page.markdown ?? htmlToMarkdown(getCleaned()));

    if (f.has("markdown")) out.markdown = getMarkdown();
    if (f.has("html")) out.html = page.html ? getCleaned() : undefined;
    if (f.has("rawHtml")) out.rawHtml = page.html ?? undefined;
    if (f.has("text")) out.text = page.html ? htmlToText(getCleaned()) : getMarkdown();
    if (f.has("links")) out.links = page.html ? extractLinks(doc, page.finalUrl) : [];
    if (f.has("images")) out.images = page.html ? extractImages(doc, page.finalUrl) : [];

    if (f.has("screenshot") && page.screenshot) {
      const bytes = Buffer.from(page.screenshot.base64, "base64");
      const mime = `image/${page.screenshot.format}`;
      out.screenshot = this.deps.store
        ? await this.deps.store.put(
            `screenshots/${createHash("sha256").update(bytes).digest("hex").slice(0, 32)}.${page.screenshot.format}`,
            bytes,
            mime,
          )
        : `data:${mime};base64,${page.screenshot.base64}`;
    }

    if (f.has("json")) {
      if (!this.deps.extractor) throw new PluckError("llm_not_configured", "No LLM is configured for JSON extraction.");
      const opts = req.jsonOptions ?? {};
      if (!opts.schema && !opts.prompt) throw new PluckError("bad_request", "The `json` format needs `jsonOptions.schema` or `jsonOptions.prompt`.");
      const { data, billing } = await this.deps.extractor.extract({
        url: page.finalUrl,
        markdown: getMarkdown(),
        schema: opts.schema,
        prompt: opts.prompt,
        llm: opts.llm,
      });
      out.json = data;
      llm = billing;
    }

    return { result: out, llm };
  }
}
