import { describe, expect, it } from "vitest";
import { brandQuery } from "./brand.js";
import { endpoints } from "./endpoints.js";
import { crawlRequest, monitorCreate, searchRequest } from "./jobs.js";
import { buildOpenApi } from "./openapi.js";
import { parseRequest, scrapeRequest } from "./scrape.js";

describe("request defaults", () => {
  it("fills scrape defaults", () => {
    const parsed = scrapeRequest.parse({ url: "https://example.com" });
    expect(parsed).toMatchObject({
      formats: ["markdown"],
      onlyMainContent: true,
      render: "auto",
      proxy: "auto",
      timeout: 30_000,
      maxAge: 3_600,
      respectRobots: true,
    });
  });

  /** Regression: a bare crawl request must still carry full scrape options. */
  it("fills nested crawl scrape options", () => {
    const parsed = crawlRequest.parse({ url: "https://example.com", limit: 5 });
    expect(parsed.scrapeOptions.formats).toEqual(["markdown"]);
    expect(parsed.scrapeOptions.render).toBe("auto");
    expect(parsed.scrapeOptions.timeout).toBeGreaterThan(0);
    expect(parsed.maxDepth).toBe(3);
  });

  it("fills search and monitor defaults", () => {
    expect(searchRequest.parse({ query: "x" })).toMatchObject({ limit: 10, category: "web" });
    expect(monitorCreate.parse({ type: "page", url: "https://example.com" })).toMatchObject({
      intervalMinutes: 1_440,
      active: true,
      proxy: "auto",
    });
  });

  it("rejects contradictory input", () => {
    expect(() => parseRequest.parse({})).toThrow();
    expect(() => parseRequest.parse({ url: "https://a.com", base64: "AA==" })).toThrow();
    expect(() => brandQuery.parse({ domain: "a.com", email: "b@c.com" })).toThrow();
    expect(brandQuery.parse({ domain: "https://www.Stripe.com/pricing" }).domain).toBe(
      "stripe.com",
    );
  });
});

describe("openapi document", () => {
  const doc = buildOpenApi({ serverUrl: "https://api.test", version: "1.2.3", billing: true });

  it("covers every endpoint", () => {
    const operations = Object.values(doc.paths).flatMap((item) => Object.keys(item));
    expect(operations.length).toBe(Object.keys(endpoints).length);
    expect(doc.components.schemas.ScrapeRequest).toBeDefined();
    expect(doc.info.version).toBe("1.2.3");
  });

  it("documents auth and errors on each operation", () => {
    for (const item of Object.values(doc.paths)) {
      for (const op of Object.values(item) as {
        security?: unknown[];
        responses: Record<string, unknown>;
      }[]) {
        expect(op.security).toEqual([{ bearer: [] }]);
        expect(op.responses["200"]).toBeDefined();
        expect(op.responses["401"]).toBeDefined();
      }
    }
  });
});
