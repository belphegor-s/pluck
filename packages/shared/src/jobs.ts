import { z } from "zod";
import { cursorQuery, httpUrl, llmOverride, pageInfo, proxyMode } from "./common.js";
import { pageMetadata, scrapeOptions, scrapeResult } from "./scrape.js";

/* ------------------------------------------------------------------ crawl */

export const webhookConfig = z
  .object({
    url: httpUrl,
    events: z
      .array(z.enum(["started", "page", "completed", "failed"]))
      .default(["completed", "failed"]),
  })
  .meta({ description: "Signed POST callbacks. Verify with the `pluck-signature` header." });

export const crawlRequest = z
  .object({
    url: httpUrl,
    limit: z.number().int().min(1).max(10_000).default(100),
    maxDepth: z.number().int().min(0).max(20).default(3),
    includePaths: z
      .array(z.string().max(300))
      .max(50)
      .optional()
      .meta({ description: "Glob patterns, e.g. `/blog/**`." }),
    excludePaths: z.array(z.string().max(300)).max(50).optional(),
    allowSubdomains: z.boolean().default(false),
    allowExternal: z.boolean().default(false),
    ignoreQueryParams: z.boolean().default(true),
    useSitemap: z.boolean().default(true),
    concurrency: z.number().int().min(1).max(50).default(10),
    // `prefault`, not `default`: the empty object must be parsed so every
    // nested scrape default (formats, render, timeout…) is filled in.
    scrapeOptions: scrapeOptions.omit({ screenshot: true }).prefault({}),
    webhook: webhookConfig.optional(),
  })
  .meta({ id: "CrawlRequest" });
export type CrawlRequest = z.infer<typeof crawlRequest>;

export const jobStatus = z.enum(["queued", "running", "completed", "failed", "cancelled"]);
export type JobStatus = z.infer<typeof jobStatus>;

export const crawlJob = z
  .object({
    id: z.string(),
    status: jobStatus,
    url: z.string(),
    total: z.number().int(),
    completed: z.number().int(),
    failed: z.number().int(),
    creditsUsed: z.number().int(),
    error: z.string().nullable(),
    createdAt: z.string(),
    finishedAt: z.string().nullable(),
  })
  .meta({ id: "CrawlJob" });
export type CrawlJob = z.infer<typeof crawlJob>;

export const crawlPagesQuery = cursorQuery;
export const crawlPage = scrapeResult.partial().extend({
  url: z.string(),
  depth: z.number().int(),
  error: z.string().nullable(),
  metadata: pageMetadata.nullable(),
});
export const crawlStatus = crawlJob.extend({ pages: z.array(crawlPage) }).extend(pageInfo.shape);

/* ----------------------------------------------------------------- search */

export const searchRequest = z
  .object({
    query: z.string().min(1).max(500),
    limit: z.number().int().min(1).max(50).default(10),
    country: z.string().length(2).toLowerCase().optional(),
    language: z.string().min(2).max(5).optional(),
    timeRange: z.enum(["day", "week", "month", "year"]).optional(),
    category: z.enum(["web", "news", "images"]).default("web"),
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
export type SearchRequest = z.infer<typeof searchRequest>;

export const searchHit = z.object({
  url: z.string(),
  title: z.string(),
  snippet: z.string(),
  publishedAt: z.string().nullable(),
  image: z.string().nullable(),
  source: z.string().nullable(),
  page: scrapeResult.partial().optional(),
});
export type SearchHit = z.infer<typeof searchHit>;
export const searchResult = z.object({
  results: z.array(searchHit),
  /** Present when some results could not be read within the time budget. */
  warnings: z.array(z.string()).optional(),
});

/* ---------------------------------------------------------------- extract */

export const extractRequest = z
  .object({
    url: httpUrl,
    schema: z
      .record(z.string(), z.unknown())
      .optional()
      .meta({ description: "JSON Schema the result must satisfy." }),
    prompt: z.string().max(8000).optional(),
    render: scrapeOptions.shape.render,
    proxy: proxyMode,
    maxAge: scrapeOptions.shape.maxAge,
    llm: llmOverride,
  })
  .refine((v) => v.schema || v.prompt, { message: "Provide `schema`, `prompt`, or both." })
  .meta({ id: "ExtractRequest" });
export type ExtractRequest = z.infer<typeof extractRequest>;

export const extractResult = z.object({ url: z.string(), data: z.unknown() });

export const product = z
  .object({
    name: z.string(),
    description: z.string().nullable(),
    brand: z.string().nullable(),
    sku: z.string().nullable(),
    gtin: z.string().nullable(),
    url: z.string().nullable(),
    images: z.array(z.string()),
    price: z.number().nullable(),
    currency: z.string().nullable(),
    availability: z.enum(["in_stock", "out_of_stock", "preorder", "unknown"]),
    rating: z.number().nullable(),
    reviewCount: z.number().int().nullable(),
    category: z.string().nullable(),
    attributes: z.record(z.string(), z.string()),
  })
  .meta({ id: "Product" });
export type Product = z.infer<typeof product>;

export const productRequest = z
  .object({ url: httpUrl, proxy: proxyMode, maxAge: scrapeOptions.shape.maxAge, llm: llmOverride })
  .meta({ id: "ProductRequest" });
export const productsRequest = productRequest
  .extend({ limit: z.number().int().min(1).max(500).default(50) })
  .meta({ id: "ProductsRequest" });
export const productResult = z.object({
  product: product.nullable(),
  source: z.enum(["structured-data", "llm"]),
});
export const productsResult = z.object({
  products: z.array(product),
  source: z.enum(["structured-data", "llm"]),
});

export const styleguideRequest = z
  .object({ url: httpUrl, proxy: proxyMode, maxAge: scrapeOptions.shape.maxAge })
  .meta({ id: "StyleguideRequest" });

export const styleguide = z
  .object({
    url: z.string(),
    colorScheme: z.enum(["light", "dark"]),
    colors: z.object({
      background: z.string().nullable(),
      foreground: z.string().nullable(),
      primary: z.string().nullable(),
      accent: z.string().nullable(),
      palette: z.array(z.object({ hex: z.string(), usage: z.number() })),
    }),
    typography: z.object({
      fonts: z.array(
        z.object({ family: z.string(), usage: z.array(z.string()), source: z.string().nullable() }),
      ),
      headings: z.record(
        z.string(),
        z.object({
          fontFamily: z.string(),
          fontSize: z.string(),
          fontWeight: z.string(),
          lineHeight: z.string(),
        }),
      ),
      body: z
        .object({ fontFamily: z.string(), fontSize: z.string(), lineHeight: z.string() })
        .nullable(),
    }),
    components: z.object({
      button: z.record(z.string(), z.string()).nullable(),
      link: z.record(z.string(), z.string()).nullable(),
      input: z.record(z.string(), z.string()).nullable(),
    }),
    radii: z.array(z.string()),
    shadows: z.array(z.string()),
    spacing: z.array(z.string()),
    cssVariables: z.record(z.string(), z.string()),
  })
  .meta({ id: "Styleguide" });
export type Styleguide = z.infer<typeof styleguide>;

/* --------------------------------------------------------------- monitors */

export const monitorType = z.enum(["page", "sitemap", "extract"]);

export const monitorCreate = z
  .object({
    name: z.string().min(1).max(120).optional(),
    type: monitorType,
    url: httpUrl,
    intervalMinutes: z.number().int().min(5).max(43_200).default(1_440),
    webhook: httpUrl.optional(),
    selector: z
      .string()
      .max(500)
      .optional()
      .meta({ description: "`page` only: watch a single CSS selector." }),
    schema: z.record(z.string(), z.unknown()).optional().meta({ description: "`extract` only." }),
    prompt: z.string().max(4000).optional(),
    proxy: proxyMode,
    active: z.boolean().default(true),
  })
  .meta({ id: "MonitorCreate" });
export type MonitorCreate = z.infer<typeof monitorCreate>;
export const monitorUpdate = monitorCreate
  .omit({ type: true })
  .partial()
  // `null` clears the field. Without it, a webhook or selector once set could
  // never be removed; omitting a field only means "leave it alone".
  .extend({
    webhook: httpUrl.nullable().optional(),
    selector: z.string().max(500).nullable().optional(),
  })
  .meta({ id: "MonitorUpdate" });

export const monitor = z
  .object({
    id: z.string(),
    name: z.string().nullable(),
    type: monitorType,
    url: z.string(),
    intervalMinutes: z.number().int(),
    webhook: z.string().nullable(),
    selector: z.string().nullable(),
    active: z.boolean(),
    lastCheckedAt: z.string().nullable(),
    lastChangedAt: z.string().nullable(),
    nextRunAt: z.string(),
    createdAt: z.string(),
  })
  .meta({ id: "Monitor" });
export type Monitor = z.infer<typeof monitor>;

export const monitorChange = z
  .object({
    id: z.string(),
    monitorId: z.string(),
    detectedAt: z.string(),
    summary: z.string().nullable(),
    diff: z.string().nullable().meta({ description: "Unified diff of the markdown / JSON." }),
    added: z.array(z.string()).optional().meta({ description: "`sitemap` monitors: new URLs." }),
    removed: z.array(z.string()).optional(),
  })
  .meta({ id: "MonitorChange" });
export type MonitorChange = z.infer<typeof monitorChange>;

export { llmOverride };

/* ---------------------------------------------------------------- webhooks */

export const webhookDelivery = z
  .object({
    id: z.string().meta({ description: "Sent to your endpoint as the delivery id header." }),
    event: z.string().meta({ example: "monitor.changed" }),
    url: z.string(),
    status: z.enum(["pending", "succeeded", "failed"]),
    attempts: z.number().int(),
    lastStatus: z
      .number()
      .int()
      .nullable()
      .meta({ description: "HTTP status of the most recent attempt, if your endpoint answered." }),
    lastError: z.string().nullable(),
    lastDurationMs: z.number().int().nullable(),
    createdAt: z.string(),
    deliveredAt: z.string().nullable(),
  })
  .meta({ id: "WebhookDelivery" });
export type WebhookDelivery = z.infer<typeof webhookDelivery>;

export const webhookTestRequest = z.object({
  url: z.url().meta({ description: "Your endpoint. A signed `webhook.test` event is sent to it." }),
});
