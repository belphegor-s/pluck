import type { BrowserAction } from "@pluck/shared";
import type { ProxyUsed } from "./net/proxy.js";

export interface RenderRequest {
  url: string;
  timeout: number;
  proxy: ProxyUsed;
  /**
   * Whose proxies to use. The renderer resolves the account's own pool itself
   * rather than accepting a URL, so provider credentials never sit in a queue.
   */
  orgId?: string;
  country?: string;
  mobile?: boolean;
  blockAds?: boolean;
  headers?: Record<string, string>;
  waitFor?: number;
  actions?: BrowserAction[];
  screenshot?: {
    fullPage: boolean;
    format: "png" | "jpeg" | "webp";
    quality: number;
    viewport?: { width: number; height: number };
  };
  /** Named in-page extraction script to run after load. */
  evaluate?: "styleguide" | "brand";
}

export interface RenderResult {
  finalUrl: string;
  status: number;
  contentType: string | null;
  html: string;
  screenshot?: { base64: string; width: number; height: number; format: "png" | "jpeg" | "webp" };
  evaluated?: unknown;
}

/** Executes a page in a real browser. Implemented by the worker (Playwright). */
export interface Renderer {
  render(req: RenderRequest): Promise<RenderResult>;
}

/** Object storage for screenshots and logos. */
export interface AssetStore {
  put(key: string, body: Buffer, contentType: string): Promise<string>;
}

export type LlmBilling = "instance" | "byok";

export interface LlmSelection {
  provider?: string;
  model?: string;
}

export interface StructuredExtractor {
  extract(input: {
    url: string;
    markdown: string;
    schema?: Record<string, unknown>;
    prompt?: string;
    llm?: LlmSelection;
  }): Promise<{ data: unknown; billing: LlmBilling }>;
}
