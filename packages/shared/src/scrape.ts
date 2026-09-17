import { z } from "zod";
import { httpUrl, llmOverride, proxyMode, renderMode } from "./common.js";

export const scrapeFormat = z.enum([
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
export type ScrapeFormat = z.infer<typeof scrapeFormat>;

export const browserAction = z.discriminatedUnion("type", [
  z.object({ type: z.literal("wait"), ms: z.number().int().min(0).max(15_000) }),
  z.object({ type: z.literal("waitForSelector"), selector: z.string().max(500) }),
  z.object({ type: z.literal("click"), selector: z.string().max(500) }),
  z.object({ type: z.literal("type"), selector: z.string().max(500), text: z.string().max(2000) }),
  z.object({ type: z.literal("press"), key: z.string().max(50) }),
  z.object({ type: z.literal("scroll"), direction: z.enum(["down", "up"]).default("down") }),
]);
export type BrowserAction = z.infer<typeof browserAction>;

export const viewport = z.object({
  width: z.number().int().min(240).max(3840).default(1440),
  height: z.number().int().min(240).max(2160).default(900),
});

export const screenshotOptions = z.object({
  fullPage: z.boolean().default(false),
  format: z.enum(["png", "jpeg", "webp"]).default("webp"),
  quality: z.number().int().min(1).max(100).default(80),
  viewport: viewport.optional(),
});

export const scrapeOptions = z.object({
  formats: z
    .array(scrapeFormat)
    .min(1)
    .max(9)
    .default(["markdown"])
    .meta({ description: "Output formats to return." }),
  onlyMainContent: z
    .boolean()
    .default(true)
    .meta({ description: "Strip nav, footers, cookie banners and ads before conversion." }),
  includeTags: z.array(z.string().max(200)).max(50).optional(),
  excludeTags: z.array(z.string().max(200)).max(50).optional(),
  render: renderMode,
  waitFor: z.number().int().min(0).max(30_000).optional(),
  actions: z.array(browserAction).max(25).optional(),
  timeout: z.number().int().min(1_000).max(120_000).default(30_000),
  headers: z.record(z.string(), z.string().max(4096)).optional(),
  proxy: proxyMode,
  country: z
    .string()
    .length(2)
    .toLowerCase()
    .optional()
    .meta({ description: "ISO country code for geo-targeted proxies." }),
  mobile: z.boolean().default(false),
  blockAds: z.boolean().default(true),
  respectRobots: z.boolean().default(true),
  maxAge: z.number().int().min(0).max(604_800).default(3_600).meta({
    description: "Serve a cached copy younger than this many seconds. 0 forces a fresh fetch.",
  }),
  screenshot: screenshotOptions.optional(),
  jsonOptions: z
    .object({
      schema: z.record(z.string(), z.unknown()).optional(),
      prompt: z.string().max(4000).optional(),
      llm: llmOverride,
    })
    .optional()
    .meta({ description: "Used with the `json` format to extract structured data." }),
});
export type ScrapeOptions = z.infer<typeof scrapeOptions>;
export type ScrapeOptionsInput = z.input<typeof scrapeOptions>;

export const scrapeRequest = scrapeOptions.extend({ url: httpUrl }).meta({ id: "ScrapeRequest" });
export type ScrapeRequest = z.infer<typeof scrapeRequest>;

export const pageMetadata = z.object({
  url: z.string(),
  finalUrl: z.string(),
  statusCode: z.number().int(),
  contentType: z.string().nullable(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  language: z.string().nullable(),
  canonical: z.string().nullable(),
  siteName: z.string().nullable(),
  author: z.string().nullable(),
  publishedAt: z.string().nullable(),
  image: z.string().nullable(),
  favicon: z.string().nullable(),
  keywords: z.array(z.string()),
  og: z.record(z.string(), z.string()),
});
export type PageMetadata = z.infer<typeof pageMetadata>;

export const imageRef = z.object({
  src: z.string(),
  alt: z.string().nullable(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
});

export const scrapeResult = z
  .object({
    markdown: z.string().optional(),
    html: z.string().optional(),
    rawHtml: z.string().optional(),
    text: z.string().optional(),
    links: z.array(z.string()).optional(),
    images: z.array(imageRef).optional(),
    metadata: pageMetadata,
    screenshot: z
      .string()
      .optional()
      .meta({ description: "Public URL, or a data URI when storage is not configured." }),
    json: z.unknown().optional(),
    renderedWith: z.enum(["http", "browser"]),
    proxyUsed: z.enum(["none", "datacenter", "residential"]),
    warnings: z.array(z.string()),
  })
  .meta({ id: "ScrapeResult" });
export type ScrapeResult = z.infer<typeof scrapeResult>;

export const screenshotRequest = screenshotOptions
  .extend({
    url: httpUrl,
    waitFor: z.number().int().min(0).max(30_000).optional(),
    actions: z.array(browserAction).max(25).optional(),
    proxy: proxyMode,
    timeout: z.number().int().min(1_000).max(120_000).default(30_000),
    maxAge: z.number().int().min(0).max(604_800).default(3_600),
  })
  .meta({ id: "ScreenshotRequest" });
export type ScreenshotRequest = z.infer<typeof screenshotRequest>;

export const screenshotResult = z.object({
  url: z.string(),
  screenshot: z.string(),
  width: z.number().int(),
  height: z.number().int(),
  format: z.enum(["png", "jpeg", "webp"]),
});

export const parseRequest = z
  .object({
    url: httpUrl.optional(),
    base64: z
      .string()
      .max(40_000_000)
      .optional()
      .meta({ description: "File bytes, base64-encoded (max ~30MB)." }),
    filename: z.string().max(255).optional(),
    contentType: z.string().max(200).optional(),
  })
  .refine((v) => Boolean(v.url) !== Boolean(v.base64), {
    message: "Provide exactly one of `url` or `base64`.",
  })
  .meta({ id: "ParseRequest" });
export type ParseRequest = z.infer<typeof parseRequest>;

export const parseResult = z.object({
  markdown: z.string(),
  contentType: z.string(),
  pages: z.number().int().nullable(),
  title: z.string().nullable(),
});
export type ParseResult = z.infer<typeof parseResult>;

export const mapRequest = z
  .object({
    url: httpUrl,
    search: z
      .string()
      .max(200)
      .optional()
      .meta({ description: "Rank URLs by relevance to this text." }),
    limit: z.number().int().min(1).max(50_000).default(5_000),
    includeSubdomains: z.boolean().default(false),
    useSitemap: z.boolean().default(true),
    proxy: proxyMode,
  })
  .meta({ id: "MapRequest" });
export type MapRequest = z.infer<typeof mapRequest>;

export const mapResult = z.object({
  links: z.array(z.object({ url: z.string(), lastmod: z.string().nullable() })),
  sources: z.array(z.string()),
});
export type MapResult = z.infer<typeof mapResult>;
