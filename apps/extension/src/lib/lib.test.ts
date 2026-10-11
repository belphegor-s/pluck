import { endpoints } from "@pluck/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, call, explain, ROUTES } from "./api";
import { normalizeApiUrl } from "./connect";
import { estimateTokens, plural, slugify } from "./format";
import { displayUrl, hostOf, reachOf } from "./page";
import { base64url, challengeFor, randomToken, textToBase64 } from "./pkce";

describe("routes", () => {
  it("match the shared endpoint registry", () => {
    for (const [id, [method, path]] of Object.entries(ROUTES)) {
      const endpoint = endpoints[id as keyof typeof ROUTES];
      expect(endpoint.path, id).toBe(path);
      expect(endpoint.method.toUpperCase(), id).toBe(method);
    }
  });
});

describe("pkce", () => {
  it("derives the challenge from RFC 7636 appendix B", async () => {
    expect(await challengeFor("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });

  it("makes url-safe tokens of the length the site expects", () => {
    expect(randomToken(32)).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomToken(16)).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(randomToken()).not.toBe(randomToken());
  });

  it("encodes without padding or url-unsafe characters", () => {
    expect(base64url(new Uint8Array([251, 255, 254]))).toBe("-__-");
    expect(base64url(new Uint8Array([1]))).toBe("AQ");
  });

  it("round-trips large non-ASCII text through base64", () => {
    const text = "h\u00e9llo \u4e16\u754c \ud83c\udf47 ".repeat(20_000);
    const bytes = Uint8Array.from(atob(textToBase64(text)), (ch) => ch.charCodeAt(0));
    expect(new TextDecoder().decode(bytes)).toBe(text);
  });
});

describe("reachOf", () => {
  it("separates public pages from ones only the browser can reach", () => {
    expect(reachOf("https://example.com/a")).toBe("public");
    expect(reachOf("http://docs.example.co.uk")).toBe("public");
    expect(reachOf("http://localhost:3000/x")).toBe("local");
    expect(reachOf("http://192.168.1.20/admin")).toBe("local");
    expect(reachOf("http://172.20.0.4")).toBe("local");
    expect(reachOf("http://172.32.0.4")).toBe("public");
    expect(reachOf("http://intranet/wiki")).toBe("local");
    expect(reachOf("https://nas.local")).toBe("local");
  });

  it("rejects anything that is not a web page", () => {
    expect(reachOf(null)).toBe("none");
    expect(reachOf("chrome://extensions")).toBe("none");
    expect(reachOf("file:///C:/notes.html")).toBe("none");
    expect(reachOf("not a url")).toBe("none");
  });
});

describe("display", () => {
  it("shortens urls for the target card", () => {
    expect(displayUrl("https://www.example.com/")).toBe("example.com");
    expect(displayUrl("https://www.example.com/docs/intro?x=1#top")).toBe("example.com/docs/intro");
    expect(hostOf("https://www.Example.com/x")).toBe("example.com");
    expect(hostOf(null)).toBe("");
  });

  it("makes safe file names", () => {
    expect(slugify("Pricing \u00b7 Stripe Docs!")).toBe("pricing-stripe-docs");
    expect(slugify("Caf\u00e9 cr\u00e8me")).toBe("cafe-creme");
    expect(slugify("\u4e16\u754c")).toBe("page");
    expect(slugify("x".repeat(200)).length).toBe(60);
  });

  it("counts and pluralises", () => {
    expect(plural(1, "credit")).toBe("1 credit");
    expect(plural(1200, "URL")).toBe("1,200 URLs");
    expect(estimateTokens("a".repeat(401))).toBe(101);
  });
});

describe("normalizeApiUrl", () => {
  it("accepts what people type", () => {
    expect(normalizeApiUrl(" http://localhost:8080/ ")).toBe("http://localhost:8080");
    expect(normalizeApiUrl("pluck-api.example.com")).toBe("https://pluck-api.example.com");
    expect(normalizeApiUrl("https://example.com/pluck/")).toBe("https://example.com/pluck");
  });

  it("refuses what is not a web address", () => {
    expect(normalizeApiUrl("")).toBeNull();
    expect(normalizeApiUrl("ftp://example.com")).toBeNull();
  });
});

describe("call", () => {
  const account = { apiUrl: "https://api.example.com/base/", apiKey: "pk_live_test" };
  afterEach(() => vi.unstubAllGlobals());

  const respond = (status: number, body: unknown) =>
    vi.fn(async () => new Response(JSON.stringify(body), { status }));

  it("posts JSON with the key, under the instance's path prefix", async () => {
    const meta = { requestId: "r1", creditsUsed: 1, cached: false, durationMs: 5 };
    const fetchMock = respond(200, { data: { markdown: "# hi" }, meta });
    vi.stubGlobal("fetch", fetchMock);

    const result = await call(account, "scrape", { url: "https://example.com" });
    expect(result.meta).toEqual(meta);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.href).toBe("https://api.example.com/base/v1/scrape");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer pk_live_test");
    expect(JSON.parse(init.body as string)).toEqual({ url: "https://example.com" });
    expect(init.credentials).toBe("omit");
  });

  it("sends GET input as a query string", async () => {
    const fetchMock = respond(200, {
      data: { domain: "stripe.com" },
      meta: { requestId: "r", creditsUsed: 10, cached: false, durationMs: 1 },
    });
    vi.stubGlobal("fetch", fetchMock);
    await call(account, "brand", { domain: "stripe.com" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.href).toBe("https://api.example.com/base/v1/brand?domain=stripe.com");
    expect(init.body).toBeUndefined();
  });

  it("turns an API error into something the panel can explain", async () => {
    vi.stubGlobal(
      "fetch",
      respond(402, {
        error: { code: "insufficient_credits", message: "Not enough credits.", requestId: "r9" },
      }),
    );
    const err = await call(account, "map", { url: "https://example.com" }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(explain(err)).toMatchObject({
      title: "Out of credits",
      action: "credits",
      requestId: "r9",
    });
  });

  it("reports an unreachable API as a network problem", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    const err = await call(account, "usage", {}).catch((e) => e);
    expect(err).toMatchObject({ code: "network" });
    expect(explain(err).detail).toContain("api.example.com");
  });

  it("suggests reading the tab when the page itself could not be fetched", () => {
    expect(explain(new ApiError("target_blocked", "Blocked.", 424)).action).toBe("live");
    expect(explain(new ApiError("invalid_api_key", "Bad.", 401)).action).toBe("reconnect");
    expect(explain(new Error("boom")).title).toBe("Something went wrong");
  });
});
