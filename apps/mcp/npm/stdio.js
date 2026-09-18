#!/usr/bin/env node

// src/stdio.ts
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
// ../../packages/shared/dist/brand.js
// ../../packages/shared/dist/common.js
import { z, z as z2 } from "zod";

var httpUrl = z
  .url({ protocol: /^https?$/ })
  .max(4096)
  .meta({ description: "Absolute http(s) URL.", example: "https://example.com" });
var domain = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(253)
  .transform((v) =>
    v
      .replace(/^https?:\/\//, "")
      .replace(/[/?#].*$/, "")
      .replace(/^www\./, ""),
  )
  .pipe(z.string().regex(z.regexes.domain, "Invalid domain"))
  .meta({ description: "Domain name, e.g. stripe.com", example: "stripe.com" });
var proxyMode = z.enum(["auto", "none", "datacenter", "residential"]).default("auto").meta({
  description:
    "Egress strategy. `auto` goes direct and escalates through datacenter then residential proxies when a request is blocked.",
});
var renderMode = z.enum(["auto", "always", "never"]).default("auto").meta({
  description:
    "Headless browser usage. `auto` fetches over HTTP first and only renders when the page needs JavaScript.",
});
var llmOverride = z
  .object({
    provider: z
      .enum(["openrouter", "openai", "anthropic", "google", "groq", "openai-compatible"])
      .optional(),
    model: z.string().max(200).optional(),
  })
  .optional()
  .meta({
    description:
      "Pick the model used for AI steps. Supply your own key via the `x-llm-key` header to pay the provider directly.",
  });
var responseMeta = z.object({
  requestId: z.string(),
  creditsUsed: z.number().int().nonnegative(),
  cached: z.boolean(),
  durationMs: z.number().int().nonnegative(),
});
var cursorQuery = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
var pageInfo = z.object({ nextCursor: z.string().nullable() });

// ../../packages/shared/dist/brand.js
var brandQuery = z2
  .object({
    domain: domain.optional(),
    email: z2.email().max(320).optional(),
    name: z2.string().min(2).max(200).optional(),
    ticker: z2.string().min(1).max(12).toUpperCase().optional(),
    maxAge: z2.coerce.number().int().min(0).max(2592e3).default(604800),
    proxy: proxyMode,
  })
  .refine((v) => [v.domain, v.email, v.name, v.ticker].filter(Boolean).length === 1, {
    message: "Provide exactly one of `domain`, `email`, `name` or `ticker`.",
  })
  .meta({ id: "BrandQuery" });
var logoAsset = z2.object({
  url: z2.string(),
  type: z2.enum(["icon", "logo", "symbol", "og", "apple-touch-icon"]),
  format: z2.string().nullable(),
  width: z2.number().int().nullable(),
  height: z2.number().int().nullable(),
  theme: z2.enum(["light", "dark"]).nullable(),
});
var industryCode = z2.object({
  code: z2.string(),
  title: z2.string(),
  confidence: z2.number().min(0).max(1),
});
var brand = z2
  .object({
    domain: z2.string(),
    name: z2.string().nullable(),
    title: z2.string().nullable(),
    description: z2.string().nullable(),
    slogan: z2.string().nullable(),
    logos: z2.array(logoAsset),
    colors: z2.array(z2.object({ hex: z2.string(), name: z2.string().nullable() })),
    fonts: z2.array(z2.string()),
    socials: z2.array(z2.object({ network: z2.string(), url: z2.string() })),
    address: z2
      .object({
        street: z2.string().nullable(),
        city: z2.string().nullable(),
        region: z2.string().nullable(),
        postalCode: z2.string().nullable(),
        country: z2.string().nullable(),
      })
      .nullable(),
    email: z2.string().nullable(),
    phone: z2.string().nullable(),
    stock: z2.object({ ticker: z2.string(), exchange: z2.string().nullable() }).nullable(),
    industries: z2
      .object({ naics: z2.array(industryCode), sic: z2.array(industryCode) })
      .nullable(),
    isNsfw: z2.boolean(),
    updatedAt: z2.string(),
  })
  .meta({ id: "Brand" });
var classifyRequest = z2
  .object({
    domain: domain.optional(),
    description: z2.string().min(10).max(8e3).optional(),
    llm: llmOverride,
  })
  .refine((v) => v.domain || v.description, { message: "Provide `domain` or `description`." })
  .meta({ id: "ClassifyRequest" });
var classifyResult = z2.object({
  naics: z2.array(industryCode),
  sic: z2.array(industryCode),
});
var transactionRequest = z2
  .object({
    descriptor: z2.string().min(2).max(300).meta({ example: "SQ *BLUE BOTTLE COFFE OAKLAND CA" }),
    country: z2.string().length(2).toLowerCase().optional(),
    mcc: z2
      .string()
      .regex(/^\d{4}$/)
      .optional(),
    amount: z2.number().optional(),
    llm: llmOverride,
  })
  .meta({ id: "TransactionRequest" });
var transactionResult = z2.object({
  merchant: z2.string().nullable(),
  domain: z2.string().nullable(),
  processor: z2.string().nullable(),
  location: z2.string().nullable(),
  confidence: z2.number().min(0).max(1),
  brand: brand.nullable(),
});
var logoQuery = z2.object({
  size: z2.coerce.number().int().min(16).max(512).default(128),
  format: z2.enum(["png", "webp", "svg"]).optional(),
  theme: z2.enum(["light", "dark"]).optional(),
  fallback: z2.enum(["monogram", "404"]).default("monogram"),
});

// ../../packages/shared/dist/endpoints.js
import { z as z5 } from "zod";

// ../../packages/shared/dist/identity.js
var config = {
  name: "Pluck",
  slug: "pluck",
  tagline: "the web, ready for your model",
  description:
    "Pluck turns any URL into clean markdown, structured JSON, screenshots and brand data for AI. Open source, self-hostable, and you can bring your own model key.",
  siteUrl: "https://pluck.procd.cc",
  apiUrl: "https://pluck-api.procd.cc",
  mcpUrl: "https://pluck-mcp.procd.cc",
  repoUrl: "https://github.com/belphegor-s/pluck",
  contactEmail: "hello@pluck.procd.cc",
  /** API keys read `<prefix>_live_…`. Changing it invalidates existing keys. */
  apiKeyPrefix: "pk",
  npmPackage: "@pluck/sdk",
};
var env = (key) => {
  const value = typeof process !== "undefined" ? process.env?.[key] : void 0;
  return value?.trim() || void 0;
};
var BRAND = {
  ...config,
  /** Domains move without a rebuild; the deployment's env wins. */
  siteUrl: env("NEXT_PUBLIC_SITE_URL") ?? env("PUBLIC_WEB_URL") ?? config.siteUrl,
  apiUrl: env("NEXT_PUBLIC_API_URL") ?? env("PUBLIC_API_URL") ?? config.apiUrl,
  mcpUrl: env("NEXT_PUBLIC_MCP_URL") ?? config.mcpUrl,
  apiKeyLive: `${config.apiKeyPrefix}_live_`,
  apiKeyFamily: `${config.apiKeyPrefix}_`,
  /** Crawler identity in robots.txt and the User-Agent header. */
  userAgent: `${config.name}Bot`,
  /** MCP tools are namespaced by slug: `pluck_scrape`, `pluck_search`, … */
  tool: (name) => `${config.slug}_${name}`,
  /** Headers: `pluck-signature`, `x-pluck-internal`. */
  header: (name) => `${config.slug}-${name}`,
};

// ../../packages/shared/dist/jobs.js
// ../../packages/shared/dist/scrape.js
import { z as z3, z as z4 } from "zod";

var scrapeFormat = z3.enum([
  "markdown",
  "html",
  "rawHtml",
  "text",
  "links",
  "images",
  "metadata",
  "screenshot",
  "json",
]);
var browserAction = z3.discriminatedUnion("type", [
  z3.object({ type: z3.literal("wait"), ms: z3.number().int().min(0).max(15e3) }),
  z3.object({ type: z3.literal("waitForSelector"), selector: z3.string().max(500) }),
  z3.object({ type: z3.literal("click"), selector: z3.string().max(500) }),
  z3.object({
    type: z3.literal("type"),
    selector: z3.string().max(500),
    text: z3.string().max(2e3),
  }),
  z3.object({ type: z3.literal("press"), key: z3.string().max(50) }),
  z3.object({ type: z3.literal("scroll"), direction: z3.enum(["down", "up"]).default("down") }),
]);
var viewport = z3.object({
  width: z3.number().int().min(240).max(3840).default(1440),
  height: z3.number().int().min(240).max(2160).default(900),
});
var screenshotOptions = z3.object({
  fullPage: z3.boolean().default(false),
  format: z3.enum(["png", "jpeg", "webp"]).default("webp"),
  quality: z3.number().int().min(1).max(100).default(80),
  viewport: viewport.optional(),
});
var scrapeOptions = z3.object({
  formats: z3
    .array(scrapeFormat)
    .min(1)
    .max(9)
    .default(["markdown"])
    .meta({ description: "Output formats to return." }),
  onlyMainContent: z3
    .boolean()
    .default(true)
    .meta({ description: "Strip nav, footers, cookie banners and ads before conversion." }),
  includeTags: z3.array(z3.string().max(200)).max(50).optional(),
  excludeTags: z3.array(z3.string().max(200)).max(50).optional(),
  render: renderMode,
  waitFor: z3.number().int().min(0).max(3e4).optional(),
  actions: z3.array(browserAction).max(25).optional(),
  timeout: z3.number().int().min(1e3).max(12e4).default(3e4),
  headers: z3.record(z3.string(), z3.string().max(4096)).optional(),
  proxy: proxyMode,
  country: z3
    .string()
    .length(2)
    .toLowerCase()
    .optional()
    .meta({ description: "ISO country code for geo-targeted proxies." }),
  mobile: z3.boolean().default(false),
  blockAds: z3.boolean().default(true),
  respectRobots: z3.boolean().default(true),
  maxAge: z3.number().int().min(0).max(604800).default(3600).meta({
    description: "Serve a cached copy younger than this many seconds. 0 forces a fresh fetch.",
  }),
  screenshot: screenshotOptions.optional(),
  jsonOptions: z3
    .object({
      schema: z3.record(z3.string(), z3.unknown()).optional(),
      prompt: z3.string().max(4e3).optional(),
      llm: llmOverride,
    })
    .optional()
    .meta({ description: "Used with the `json` format to extract structured data." }),
});
var scrapeRequest = scrapeOptions.extend({ url: httpUrl }).meta({ id: "ScrapeRequest" });
var pageMetadata = z3.object({
  url: z3.string(),
  finalUrl: z3.string(),
  statusCode: z3.number().int(),
  contentType: z3.string().nullable(),
  title: z3.string().nullable(),
  description: z3.string().nullable(),
  language: z3.string().nullable(),
  canonical: z3.string().nullable(),
  siteName: z3.string().nullable(),
  author: z3.string().nullable(),
  publishedAt: z3.string().nullable(),
  image: z3.string().nullable(),
  favicon: z3.string().nullable(),
  keywords: z3.array(z3.string()),
  og: z3.record(z3.string(), z3.string()),
});
var imageRef = z3.object({
  src: z3.string(),
  alt: z3.string().nullable(),
  width: z3.number().int().nullable(),
  height: z3.number().int().nullable(),
});
var scrapeResult = z3
  .object({
    markdown: z3.string().optional(),
    html: z3.string().optional(),
    rawHtml: z3.string().optional(),
    text: z3.string().optional(),
    links: z3.array(z3.string()).optional(),
    images: z3.array(imageRef).optional(),
    metadata: pageMetadata,
    screenshot: z3
      .string()
      .optional()
      .meta({ description: "Public URL, or a data URI when storage is not configured." }),
    json: z3.unknown().optional(),
    renderedWith: z3.enum(["http", "browser"]),
    proxyUsed: z3.enum(["none", "datacenter", "residential"]),
    warnings: z3.array(z3.string()),
  })
  .meta({ id: "ScrapeResult" });
var screenshotRequest = screenshotOptions
  .extend({
    url: httpUrl,
    waitFor: z3.number().int().min(0).max(3e4).optional(),
    actions: z3.array(browserAction).max(25).optional(),
    proxy: proxyMode,
    timeout: z3.number().int().min(1e3).max(12e4).default(3e4),
    maxAge: z3.number().int().min(0).max(604800).default(3600),
  })
  .meta({ id: "ScreenshotRequest" });
var screenshotResult = z3.object({
  url: z3.string(),
  screenshot: z3.string(),
  width: z3.number().int(),
  height: z3.number().int(),
  format: z3.enum(["png", "jpeg", "webp"]),
});
var parseRequest = z3
  .object({
    url: httpUrl.optional(),
    base64: z3
      .string()
      .max(4e7)
      .optional()
      .meta({ description: "File bytes, base64-encoded (max ~30MB)." }),
    filename: z3.string().max(255).optional(),
    contentType: z3.string().max(200).optional(),
  })
  .refine((v) => Boolean(v.url) !== Boolean(v.base64), {
    message: "Provide exactly one of `url` or `base64`.",
  })
  .meta({ id: "ParseRequest" });
var parseResult = z3.object({
  markdown: z3.string(),
  contentType: z3.string(),
  pages: z3.number().int().nullable(),
  title: z3.string().nullable(),
});
var mapRequest = z3
  .object({
    url: httpUrl,
    search: z3
      .string()
      .max(200)
      .optional()
      .meta({ description: "Rank URLs by relevance to this text." }),
    limit: z3.number().int().min(1).max(5e4).default(5e3),
    includeSubdomains: z3.boolean().default(false),
    useSitemap: z3.boolean().default(true),
    proxy: proxyMode,
  })
  .meta({ id: "MapRequest" });
var mapResult = z3.object({
  links: z3.array(z3.object({ url: z3.string(), lastmod: z3.string().nullable() })),
  sources: z3.array(z3.string()),
});

// ../../packages/shared/dist/jobs.js
var webhookConfig = z4
  .object({
    url: httpUrl,
    events: z4
      .array(z4.enum(["started", "page", "completed", "failed"]))
      .default(["completed", "failed"]),
  })
  .meta({ description: "Signed POST callbacks. Verify with the `pluck-signature` header." });
var crawlRequest = z4
  .object({
    url: httpUrl,
    limit: z4.number().int().min(1).max(1e4).default(100),
    maxDepth: z4.number().int().min(0).max(20).default(3),
    includePaths: z4
      .array(z4.string().max(300))
      .max(50)
      .optional()
      .meta({ description: "Glob patterns, e.g. `/blog/**`." }),
    excludePaths: z4.array(z4.string().max(300)).max(50).optional(),
    allowSubdomains: z4.boolean().default(false),
    allowExternal: z4.boolean().default(false),
    ignoreQueryParams: z4.boolean().default(true),
    useSitemap: z4.boolean().default(true),
    concurrency: z4.number().int().min(1).max(50).default(10),
    // `prefault`, not `default`: the empty object must be parsed so every
    // nested scrape default (formats, render, timeout…) is filled in.
    scrapeOptions: scrapeOptions.omit({ screenshot: true }).prefault({}),
    webhook: webhookConfig.optional(),
  })
  .meta({ id: "CrawlRequest" });
var jobStatus = z4.enum(["queued", "running", "completed", "failed", "cancelled"]);
var crawlJob = z4
  .object({
    id: z4.string(),
    status: jobStatus,
    url: z4.string(),
    total: z4.number().int(),
    completed: z4.number().int(),
    failed: z4.number().int(),
    creditsUsed: z4.number().int(),
    error: z4.string().nullable(),
    createdAt: z4.string(),
    finishedAt: z4.string().nullable(),
  })
  .meta({ id: "CrawlJob" });
var crawlPagesQuery = cursorQuery;
var crawlPage = scrapeResult.partial().extend({
  url: z4.string(),
  depth: z4.number().int(),
  error: z4.string().nullable(),
  metadata: pageMetadata.nullable(),
});
var crawlStatus = crawlJob.extend({ pages: z4.array(crawlPage) }).extend(pageInfo.shape);
var searchRequest = z4
  .object({
    query: z4.string().min(1).max(500),
    limit: z4.number().int().min(1).max(50).default(10),
    country: z4.string().length(2).toLowerCase().optional(),
    language: z4.string().min(2).max(5).optional(),
    timeRange: z4.enum(["day", "week", "month", "year"]).optional(),
    category: z4.enum(["web", "news", "images"]).default("web"),
    scrape: scrapeOptions
      .pick({
        formats: true,
        onlyMainContent: true,
        render: true,
        proxy: true,
        maxAge: true,
        timeout: true,
      })
      .optional()
      .meta({ description: "Also scrape every result. Scrape credits apply per result." }),
  })
  .meta({ id: "SearchRequest" });
var searchHit = z4.object({
  url: z4.string(),
  title: z4.string(),
  snippet: z4.string(),
  publishedAt: z4.string().nullable(),
  image: z4.string().nullable(),
  source: z4.string().nullable(),
  page: scrapeResult.partial().optional(),
});
var searchResult = z4.object({ results: z4.array(searchHit) });
var extractRequest = z4
  .object({
    url: httpUrl,
    schema: z4
      .record(z4.string(), z4.unknown())
      .optional()
      .meta({ description: "JSON Schema the result must satisfy." }),
    prompt: z4.string().max(8e3).optional(),
    render: scrapeOptions.shape.render,
    proxy: proxyMode,
    maxAge: scrapeOptions.shape.maxAge,
    llm: llmOverride,
  })
  .refine((v) => v.schema || v.prompt, { message: "Provide `schema`, `prompt`, or both." })
  .meta({ id: "ExtractRequest" });
var extractResult = z4.object({ url: z4.string(), data: z4.unknown() });
var product = z4
  .object({
    name: z4.string(),
    description: z4.string().nullable(),
    brand: z4.string().nullable(),
    sku: z4.string().nullable(),
    gtin: z4.string().nullable(),
    url: z4.string().nullable(),
    images: z4.array(z4.string()),
    price: z4.number().nullable(),
    currency: z4.string().nullable(),
    availability: z4.enum(["in_stock", "out_of_stock", "preorder", "unknown"]),
    rating: z4.number().nullable(),
    reviewCount: z4.number().int().nullable(),
    category: z4.string().nullable(),
    attributes: z4.record(z4.string(), z4.string()),
  })
  .meta({ id: "Product" });
var productRequest = z4
  .object({ url: httpUrl, proxy: proxyMode, maxAge: scrapeOptions.shape.maxAge, llm: llmOverride })
  .meta({ id: "ProductRequest" });
var productsRequest = productRequest
  .extend({ limit: z4.number().int().min(1).max(500).default(50) })
  .meta({ id: "ProductsRequest" });
var productResult = z4.object({
  product: product.nullable(),
  source: z4.enum(["structured-data", "llm"]),
});
var productsResult = z4.object({
  products: z4.array(product),
  source: z4.enum(["structured-data", "llm"]),
});
var styleguideRequest = z4
  .object({ url: httpUrl, proxy: proxyMode, maxAge: scrapeOptions.shape.maxAge })
  .meta({ id: "StyleguideRequest" });
var styleguide = z4
  .object({
    url: z4.string(),
    colorScheme: z4.enum(["light", "dark"]),
    colors: z4.object({
      background: z4.string().nullable(),
      foreground: z4.string().nullable(),
      primary: z4.string().nullable(),
      accent: z4.string().nullable(),
      palette: z4.array(z4.object({ hex: z4.string(), usage: z4.number() })),
    }),
    typography: z4.object({
      fonts: z4.array(
        z4.object({
          family: z4.string(),
          usage: z4.array(z4.string()),
          source: z4.string().nullable(),
        }),
      ),
      headings: z4.record(
        z4.string(),
        z4.object({
          fontFamily: z4.string(),
          fontSize: z4.string(),
          fontWeight: z4.string(),
          lineHeight: z4.string(),
        }),
      ),
      body: z4
        .object({ fontFamily: z4.string(), fontSize: z4.string(), lineHeight: z4.string() })
        .nullable(),
    }),
    components: z4.object({
      button: z4.record(z4.string(), z4.string()).nullable(),
      link: z4.record(z4.string(), z4.string()).nullable(),
      input: z4.record(z4.string(), z4.string()).nullable(),
    }),
    radii: z4.array(z4.string()),
    shadows: z4.array(z4.string()),
    spacing: z4.array(z4.string()),
    cssVariables: z4.record(z4.string(), z4.string()),
  })
  .meta({ id: "Styleguide" });
var monitorType = z4.enum(["page", "sitemap", "extract"]);
var monitorCreate = z4
  .object({
    name: z4.string().min(1).max(120).optional(),
    type: monitorType,
    url: httpUrl,
    intervalMinutes: z4.number().int().min(5).max(43200).default(1440),
    webhook: httpUrl.optional(),
    selector: z4
      .string()
      .max(500)
      .optional()
      .meta({ description: "`page` only: watch a single CSS selector." }),
    schema: z4
      .record(z4.string(), z4.unknown())
      .optional()
      .meta({ description: "`extract` only." }),
    prompt: z4.string().max(4e3).optional(),
    proxy: proxyMode,
    active: z4.boolean().default(true),
  })
  .meta({ id: "MonitorCreate" });
var monitorUpdate = monitorCreate.omit({ type: true }).partial().meta({ id: "MonitorUpdate" });
var monitor = z4
  .object({
    id: z4.string(),
    name: z4.string().nullable(),
    type: monitorType,
    url: z4.string(),
    intervalMinutes: z4.number().int(),
    webhook: z4.string().nullable(),
    selector: z4.string().nullable(),
    active: z4.boolean(),
    lastCheckedAt: z4.string().nullable(),
    lastChangedAt: z4.string().nullable(),
    nextRunAt: z4.string(),
    createdAt: z4.string(),
  })
  .meta({ id: "Monitor" });
var monitorChange = z4
  .object({
    id: z4.string(),
    monitorId: z4.string(),
    detectedAt: z4.string(),
    summary: z4.string().nullable(),
    diff: z4.string().nullable().meta({ description: "Unified diff of the markdown / JSON." }),
    added: z4.array(z4.string()).optional().meta({ description: "`sitemap` monitors: new URLs." }),
    removed: z4.array(z4.string()).optional(),
  })
  .meta({ id: "MonitorChange" });

// ../../packages/shared/dist/endpoints.js
var idParam = z5.object({ id: z5.string().min(1).max(64) });
var usage = z5.object({
  balance: z5.number().int().nullable().meta({ description: "`null` when billing is disabled." }),
  period: z5.object({ from: z5.string(), to: z5.string() }),
  totalCredits: z5.number().int(),
  totalRequests: z5.number().int(),
  byEndpoint: z5.array(
    z5.object({ endpoint: z5.string(), requests: z5.number().int(), credits: z5.number().int() }),
  ),
  daily: z5.array(
    z5.object({ date: z5.string(), requests: z5.number().int(), credits: z5.number().int() }),
  ),
});
var usageQuery = z5.object({ days: z5.coerce.number().int().min(1).max(90).default(30) });
var ep = (e) => e;
var endpoints = {
  scrape: ep({
    id: "scrape",
    method: "post",
    path: "/v1/scrape",
    tag: "Scrape",
    summary: "Scrape a URL",
    description:
      "Fetch any page and return clean, LLM-ready markdown plus optional HTML, links, images, metadata, a screenshot or schema-validated JSON. JavaScript is rendered automatically when needed.",
    cost: "1 credit. +2 browser render, +5 residential proxy, +2 screenshot, +8 JSON (1 with your own LLM key).",
    body: scrapeRequest,
    response: scrapeResult,
    mcp: { name: BRAND.tool("scrape"), readOnly: true },
  }),
  parse: ep({
    id: "parse",
    method: "post",
    path: "/v1/parse",
    tag: "Scrape",
    summary: "Parse a document",
    description: "Convert PDF, DOCX, HTML, CSV, JSON or plain-text bytes into markdown.",
    cost: "2 credits, +1 per 10 PDF pages.",
    body: parseRequest,
    response: parseResult,
    mcp: { name: BRAND.tool("parse"), readOnly: true },
  }),
  map: ep({
    id: "map",
    method: "post",
    path: "/v1/map",
    tag: "Scrape",
    summary: "Map a website",
    description:
      "Discover every URL on a site from sitemaps, robots.txt and on-page links in seconds.",
    cost: "1 credit.",
    body: mapRequest,
    response: mapResult,
    mcp: { name: BRAND.tool("map"), readOnly: true },
  }),
  screenshot: ep({
    id: "screenshot",
    method: "post",
    path: "/v1/screenshot",
    tag: "Scrape",
    summary: "Screenshot a page",
    description: "Render a page in a real browser and capture the viewport or the full page.",
    cost: "5 credits.",
    body: screenshotRequest,
    response: screenshotResult,
  }),
  crawlStart: ep({
    id: "crawlStart",
    method: "post",
    path: "/v1/crawl",
    tag: "Crawl",
    summary: "Start a crawl",
    description:
      "Crawl a website breadth-first and scrape every matching page. Returns immediately with a job id.",
    cost: "Scrape cost per page.",
    body: crawlRequest,
    response: crawlJob,
    mcp: { name: BRAND.tool("crawl"), readOnly: true },
  }),
  crawlGet: ep({
    id: "crawlGet",
    method: "get",
    path: "/v1/crawl/{id}",
    tag: "Crawl",
    summary: "Get crawl status and pages",
    description: "Poll progress and page results. Paginate with `cursor`.",
    cost: "Free.",
    params: idParam,
    query: crawlPagesQuery,
    response: crawlStatus,
    mcp: { name: BRAND.tool("crawl_status"), readOnly: true },
  }),
  crawlCancel: ep({
    id: "crawlCancel",
    method: "delete",
    path: "/v1/crawl/{id}",
    tag: "Crawl",
    summary: "Cancel a crawl",
    description: "Stop a running crawl. Pages already scraped are kept.",
    cost: "Free.",
    params: idParam,
    response: crawlJob,
  }),
  search: ep({
    id: "search",
    method: "post",
    path: "/v1/search",
    tag: "Search",
    summary: "Search the web",
    description:
      "Ranked web, news or image results, optionally with every result scraped to markdown.",
    cost: "2 credits, plus scrape cost per result when `scrape` is set.",
    body: searchRequest,
    response: searchResult,
    mcp: { name: BRAND.tool("search"), readOnly: true },
  }),
  extract: ep({
    id: "extract",
    method: "post",
    path: "/v1/extract",
    tag: "Extract",
    summary: "Extract structured data",
    description: "Turn any page into JSON that matches your schema, guided by an optional prompt.",
    cost: "1 credit + 8 (1 with your own LLM key).",
    body: extractRequest,
    response: extractResult,
    mcp: { name: BRAND.tool("extract"), readOnly: true },
  }),
  product: ep({
    id: "product",
    method: "post",
    path: "/v1/extract/product",
    tag: "Extract",
    summary: "Extract a product",
    description:
      "Normalised product data from a product page. Uses structured data first, the LLM only as a fallback.",
    cost: "3 credits (+8 if the LLM fallback runs).",
    body: productRequest,
    response: productResult,
  }),
  products: ep({
    id: "products",
    method: "post",
    path: "/v1/extract/products",
    tag: "Extract",
    summary: "Extract a product listing",
    description: "Every product on a category, collection or search results page.",
    cost: "3 credits (+8 if the LLM fallback runs).",
    body: productsRequest,
    response: productsResult,
  }),
  styleguide: ep({
    id: "styleguide",
    method: "post",
    path: "/v1/styleguide",
    tag: "Extract",
    summary: "Extract a styleguide",
    description:
      "Design tokens from a live site: palette, fonts, type scale, radii, shadows and component styles.",
    cost: "5 credits.",
    body: styleguideRequest,
    response: styleguide,
    mcp: { name: BRAND.tool("styleguide"), readOnly: true },
  }),
  brand: ep({
    id: "brand",
    method: "get",
    path: "/v1/brand",
    tag: "Brand",
    summary: "Retrieve a brand",
    description:
      "Resolve a domain, work email, company name or stock ticker into a brand profile: logos, colors, fonts, socials, address and industry.",
    cost: "10 credits. Cached profiles cost 2.",
    query: brandQuery,
    response: brand,
    mcp: { name: BRAND.tool("brand"), readOnly: true },
  }),
  classify: ep({
    id: "classify",
    method: "post",
    path: "/v1/brand/classify",
    tag: "Brand",
    summary: "Classify an industry",
    description: "NAICS 2022 and SIC codes for a company, with confidence scores.",
    cost: "3 credits.",
    body: classifyRequest,
    response: classifyResult,
  }),
  transaction: ep({
    id: "transaction",
    method: "post",
    path: "/v1/brand/transaction",
    tag: "Brand",
    summary: "Identify a transaction",
    description: "Map a raw card or bank descriptor to the merchant behind it.",
    cost: "5 credits.",
    body: transactionRequest,
    response: transactionResult,
  }),
  monitorCreate: ep({
    id: "monitorCreate",
    method: "post",
    path: "/v1/monitors",
    tag: "Monitors",
    summary: "Create a monitor",
    description:
      "Watch a page, a sitemap or extracted data for changes and get a webhook when they happen.",
    cost: "1 credit per check, plus the underlying scrape/extract cost.",
    body: monitorCreate,
    response: monitor,
  }),
  monitorList: ep({
    id: "monitorList",
    method: "get",
    path: "/v1/monitors",
    tag: "Monitors",
    summary: "List monitors",
    description: "All monitors on the account.",
    cost: "Free.",
    query: cursorQuery,
    response: z5.object({ monitors: z5.array(monitor) }).extend(pageInfo.shape),
  }),
  monitorGet: ep({
    id: "monitorGet",
    method: "get",
    path: "/v1/monitors/{id}",
    tag: "Monitors",
    summary: "Get a monitor",
    description: "A single monitor.",
    cost: "Free.",
    params: idParam,
    response: monitor,
  }),
  monitorUpdate: ep({
    id: "monitorUpdate",
    method: "patch",
    path: "/v1/monitors/{id}",
    tag: "Monitors",
    summary: "Update a monitor",
    description: "Change interval, webhook or pause a monitor.",
    cost: "Free.",
    params: idParam,
    body: monitorUpdate,
    response: monitor,
  }),
  monitorDelete: ep({
    id: "monitorDelete",
    method: "delete",
    path: "/v1/monitors/{id}",
    tag: "Monitors",
    summary: "Delete a monitor",
    description: "Stop and delete a monitor and its history.",
    cost: "Free.",
    params: idParam,
    response: z5.object({ deleted: z5.literal(true) }),
  }),
  monitorChanges: ep({
    id: "monitorChanges",
    method: "get",
    path: "/v1/monitors/{id}/changes",
    tag: "Monitors",
    summary: "List detected changes",
    description: "Change history with diffs, newest first.",
    cost: "Free.",
    params: idParam,
    query: cursorQuery,
    response: z5.object({ changes: z5.array(monitorChange) }).extend(pageInfo.shape),
  }),
  usage: ep({
    id: "usage",
    method: "get",
    path: "/v1/usage",
    tag: "Account",
    summary: "Get usage",
    description: "Credit balance and usage breakdown for the API key's account.",
    cost: "Free.",
    query: usageQuery,
    response: usage,
  }),
};

// ../../packages/shared/dist/errors.js
import { z as z6 } from "zod";

var errorCodes = {
  bad_request: 400,
  invalid_api_key: 401,
  insufficient_credits: 402,
  forbidden: 403,
  not_found: 404,
  blocked_by_robots: 403,
  unsupported_content: 415,
  target_unreachable: 424,
  target_blocked: 424,
  target_timeout: 424,
  llm_not_configured: 400,
  llm_failed: 424,
  rate_limited: 429,
  internal: 500,
};
var errorBody = z6
  .object({
    error: z6.object({
      code: z6.enum(Object.keys(errorCodes)),
      message: z6.string(),
      requestId: z6.string().optional(),
      details: z6.unknown().optional(),
    }),
  })
  .meta({ id: "Error" });

// src/server.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
// ../../packages/shared/dist/openapi.js
import { z as z7, z as z8 } from "zod";

var t = BRAND.tool;
var INSTRUCTIONS = `${BRAND.name} gives you the live web as clean, LLM-ready context.
- ${t("search")}: find pages. Set scrape to get their content in one call.
- ${t("scrape")}: read one URL as markdown (JS rendered automatically).
- ${t("map")}: list every URL on a site before crawling.
- ${t("crawl")} then ${t("crawl_status")}: read a whole site or section.
- ${t("extract")}: structured JSON from a page against a JSON schema.
- ${t("brand")} / ${t("styleguide")}: company profile, logos, colors, fonts and design tokens.
Prefer map + targeted scrapes over large crawls. Keep crawl limits small.`;
var tools = Object.values(endpoints).filter((e) => Boolean(e.mcp));
function inputSchema(e) {
  const merged = {
    type: "object",
    properties: {},
    required: [],
  };
  for (const schema of [e.body, e.query, e.params]) {
    if (!schema) continue;
    let json = z8.toJSONSchema(schema, { io: "input", unrepresentable: "any" });
    if (json.$ref?.startsWith("#/$defs/")) json = { ...json, ...json.$defs?.[json.$ref.slice(8)] };
    Object.assign(merged.properties, json.properties);
    merged.required.push(...(json.required ?? []));
  }
  return merged;
}
function createMcpServer(opts) {
  const server2 = new Server(
    { name: BRAND.slug, title: BRAND.name, version: "0.1.0", websiteUrl: BRAND.siteUrl },
    { capabilities: { tools: {} }, instructions: INSTRUCTIONS },
  );
  server2.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((e) => ({
      name: e.mcp.name,
      title: e.summary,
      description: `${e.description}

Cost: ${e.cost}`,
      inputSchema: inputSchema(e),
      annotations: {
        readOnlyHint: e.mcp.readOnly,
        openWorldHint: true,
        idempotentHint: e.method === "get",
      },
    })),
  }));
  server2.setRequestHandler(CallToolRequestSchema, async (request) => {
    const e = tools.find((t2) => t2.mcp.name === request.params.name);
    if (!e)
      return {
        isError: true,
        content: [{ type: "text", text: `Unknown tool ${request.params.name}` }],
      };
    const args = { ...(request.params.arguments ?? {}) };
    let path = e.path;
    for (const key of Object.keys(e.params?.shape ?? {})) {
      path = path.replace(`{${key}}`, encodeURIComponent(String(args[key] ?? "")));
      delete args[key];
    }
    const url = new URL(path, opts.apiUrl);
    if (e.method === "get") {
      for (const [k, v] of Object.entries(args))
        if (v !== void 0 && v !== null) url.searchParams.set(k, String(v));
    }
    const res = await fetch(url, {
      method: e.method.toUpperCase(),
      headers: {
        authorization: `Bearer ${opts.apiKey}`,
        "content-type": "application/json",
        "user-agent": `${BRAND.slug}-mcp/0.1`,
        ...opts.llmHeaders,
      },
      body: e.method === "get" ? void 0 : JSON.stringify(args),
      signal: AbortSignal.timeout(17e4),
    });
    const payload = await res.json().catch(() => null);
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
  return server2;
}
function render(id, data) {
  const d = data;
  if (id === "scrape" && typeof d.markdown === "string") {
    const meta = d.metadata;
    return `# ${meta?.title ?? ""}
Source: ${meta?.finalUrl ?? ""}

${d.markdown}`;
  }
  if (id === "search" && Array.isArray(d.results)) {
    return d.results
      .map(
        (r, i) => `## ${i + 1}. ${r.title}
${r.url}
${r.snippet}${
  r.page?.markdown
    ? `

${r.page.markdown}`
    : ""
}`,
      )
      .join("\n\n");
  }
  return JSON.stringify(data, null, 2);
}
var toStructured = (data) =>
  data && typeof data === "object" && !Array.isArray(data) ? data : { result: data };

// src/stdio.ts
var apiKey = process.env.PLUCK_API_KEY;
if (!apiKey) {
  console.error(`PLUCK_API_KEY is required. Create one at ${BRAND.siteUrl}/dashboard/keys`);
  process.exit(1);
}
var llmHeaders = {};
if (process.env.PLUCK_LLM_PROVIDER) llmHeaders["x-llm-provider"] = process.env.PLUCK_LLM_PROVIDER;
if (process.env.PLUCK_LLM_KEY) llmHeaders["x-llm-key"] = process.env.PLUCK_LLM_KEY;
if (process.env.PLUCK_LLM_MODEL) llmHeaders["x-llm-model"] = process.env.PLUCK_LLM_MODEL;
var server = createMcpServer({
  apiUrl: process.env.PLUCK_API_URL ?? BRAND.apiUrl,
  apiKey,
  llmHeaders,
});
await server.connect(new StdioServerTransport());
