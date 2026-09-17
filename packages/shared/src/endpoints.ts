import { z } from "zod";
import { brand, brandQuery, classifyRequest, classifyResult, transactionRequest, transactionResult } from "./brand.js";
import { cursorQuery, pageInfo } from "./common.js";
import {
  crawlJob,
  crawlPagesQuery,
  crawlRequest,
  crawlStatus,
  extractRequest,
  extractResult,
  monitor,
  monitorChange,
  monitorCreate,
  monitorUpdate,
  productRequest,
  productResult,
  productsRequest,
  productsResult,
  searchRequest,
  searchResult,
  styleguide,
  styleguideRequest,
} from "./jobs.js";
import {
  mapRequest,
  mapResult,
  parseRequest,
  parseResult,
  scrapeRequest,
  scrapeResult,
  screenshotRequest,
  screenshotResult,
} from "./scrape.js";

export const idParam = z.object({ id: z.string().min(1).max(64) });

export const usage = z.object({
  balance: z.number().int().nullable().meta({ description: "`null` when billing is disabled." }),
  period: z.object({ from: z.string(), to: z.string() }),
  totalCredits: z.number().int(),
  totalRequests: z.number().int(),
  byEndpoint: z.array(z.object({ endpoint: z.string(), requests: z.number().int(), credits: z.number().int() })),
  daily: z.array(z.object({ date: z.string(), requests: z.number().int(), credits: z.number().int() })),
});

export const usageQuery = z.object({ days: z.coerce.number().int().min(1).max(90).default(30) });

export type Tag = "Scrape" | "Crawl" | "Search" | "Extract" | "Brand" | "Monitors" | "Account";

export interface Endpoint {
  id: string;
  method: "get" | "post" | "patch" | "delete";
  path: string;
  tag: Tag;
  summary: string;
  description: string;
  cost: string;
  body?: z.ZodType;
  query?: z.ZodType;
  params?: z.ZodObject;
  response: z.ZodType;
  /** Exposed as an MCP tool. */
  mcp?: { name: string; readOnly: boolean };
}

const ep = <const E extends Endpoint>(e: E) => e;

export const endpoints = {
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
    mcp: { name: "pluck_scrape", readOnly: true },
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
    mcp: { name: "pluck_parse", readOnly: true },
  }),
  map: ep({
    id: "map",
    method: "post",
    path: "/v1/map",
    tag: "Scrape",
    summary: "Map a website",
    description: "Discover every URL on a site from sitemaps, robots.txt and on-page links in seconds.",
    cost: "1 credit.",
    body: mapRequest,
    response: mapResult,
    mcp: { name: "pluck_map", readOnly: true },
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
    description: "Crawl a website breadth-first and scrape every matching page. Returns immediately with a job id.",
    cost: "Scrape cost per page.",
    body: crawlRequest,
    response: crawlJob,
    mcp: { name: "pluck_crawl", readOnly: true },
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
    mcp: { name: "pluck_crawl_status", readOnly: true },
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
    description: "Ranked web, news or image results, optionally with every result scraped to markdown.",
    cost: "2 credits, plus scrape cost per result when `scrape` is set.",
    body: searchRequest,
    response: searchResult,
    mcp: { name: "pluck_search", readOnly: true },
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
    mcp: { name: "pluck_extract", readOnly: true },
  }),
  product: ep({
    id: "product",
    method: "post",
    path: "/v1/extract/product",
    tag: "Extract",
    summary: "Extract a product",
    description: "Normalised product data from a product page. Uses structured data first, the LLM only as a fallback.",
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
    description: "Design tokens from a live site: palette, fonts, type scale, radii, shadows and component styles.",
    cost: "5 credits.",
    body: styleguideRequest,
    response: styleguide,
    mcp: { name: "pluck_styleguide", readOnly: true },
  }),
  brand: ep({
    id: "brand",
    method: "get",
    path: "/v1/brand",
    tag: "Brand",
    summary: "Retrieve a brand",
    description: "Resolve a domain, work email, company name or stock ticker into a brand profile: logos, colors, fonts, socials, address and industry.",
    cost: "10 credits. Cached profiles cost 2.",
    query: brandQuery,
    response: brand,
    mcp: { name: "pluck_brand", readOnly: true },
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
    description: "Watch a page, a sitemap or extracted data for changes and get a webhook when they happen.",
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
    response: z.object({ monitors: z.array(monitor) }).extend(pageInfo.shape),
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
    response: z.object({ deleted: z.literal(true) }),
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
    response: z.object({ changes: z.array(monitorChange) }).extend(pageInfo.shape),
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
} as const satisfies Record<string, Endpoint>;

export type Endpoints = typeof endpoints;
export type EndpointId = keyof Endpoints;

type Infer<T> = T extends z.ZodType ? z.input<T> : never;
type Out<T> = T extends z.ZodType ? z.output<T> : never;

/** Input type for an endpoint: body, query and path params merged. */
export type EndpointInput<K extends EndpointId> = (Endpoints[K] extends { body: infer B } ? Infer<B> : unknown) &
  (Endpoints[K] extends { query: infer Q } ? Infer<Q> : unknown) &
  (Endpoints[K] extends { params: infer P } ? Infer<P> : unknown);

export type EndpointOutput<K extends EndpointId> = Out<Endpoints[K]["response"]>;
