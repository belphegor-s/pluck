import { describe, expect, it } from "vitest";
import { extractBrandFromHtml, isNeutral, normaliseHex } from "./brand/extract.js";
import { productsFromStructuredData } from "./brand/products.js";
import { diffSets, diffText } from "./diff.js";
import { cleanHtml, extractLinks, htmlToMarkdown } from "./html/content.js";
import { isBlocked, needsJavaScript } from "./html/detect.js";
import { parseDocument } from "./html/document.js";
import { extractMetadata } from "./html/metadata.js";
import { ProxyPool } from "./net/proxy.js";
import { assertPublicUrl, isPrivateAddress } from "./net/ssrf.js";
import { detectKind, parseDocumentBytes } from "./parse/index.js";
import { normaliseUrl, pathMatcher, sameSite } from "./urls.js";

describe("ssrf", () => {
  it.each([
    ["127.0.0.1", true],
    ["10.1.2.3", true],
    ["172.20.0.1", true],
    ["192.168.1.1", true],
    ["169.254.169.254", true],
    ["100.64.0.1", true],
    ["::1", true],
    ["fd00::1", true],
    ["::ffff:127.0.0.1", true],
    ["8.8.8.8", false],
    ["103.102.166.224", false],
    ["2606:4700::1111", false],
  ])("%s private=%s", (ip, expected) => {
    expect(isPrivateAddress(ip)).toBe(expected);
  });

  it("rejects private and credentialed URLs", () => {
    expect(() => assertPublicUrl("http://localhost:3000", false)).toThrow();
    expect(() => assertPublicUrl("http://[::1]/", false)).toThrow();
    expect(() => assertPublicUrl("http://user:pw@example.com", false)).toThrow();
    expect(() => assertPublicUrl("file:///etc/passwd", false)).toThrow();
    expect(assertPublicUrl("https://example.com/a", false).href).toBe("https://example.com/a");
    expect(assertPublicUrl("http://localhost:3000", true).hostname).toBe("localhost");
  });
});

describe("proxy ladder", () => {
  const pool = new ProxyPool({ datacenter: ["http://dc:1"], residential: ["http://u-{country}:p@res:2"] });
  it("escalates in auto mode", () => expect(pool.ladder("auto")).toEqual(["none", "datacenter", "residential"]));
  it("degrades gracefully", () => expect(new ProxyPool({ datacenter: [], residential: [] }).ladder("residential")).toEqual(["none"]));
  it("fills placeholders", () => expect(pool.pick("residential", { country: "de" })?.url).toBe("http://u-de:p@res:2"));
});

describe("html", () => {
  const page = `<!doctype html><html lang="en"><head>
    <title>Acme | Rockets for everyone</title>
    <meta name="description" content="We build rockets.">
    <meta property="og:image" content="/og.png">
    <meta name="theme-color" content="#FF4F1A">
    <link rel="icon" href="/favicon.svg">
    <link rel="canonical" href="https://acme.test/">
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Acme","logo":"https://acme.test/logo.svg","sameAs":["https://github.com/acme","https://x.com/acme"]}</script>
  </head><body>
    <header><a href="/"><img src="/logo.svg" alt="Acme logo" width="120" height="32"></a><nav><a href="/pricing">Pricing</a></nav></header>
    <div class="cookie-banner">We use cookies</div>
    <main><h1>Rockets</h1><p>Our <a href="/docs?utm_source=x">docs</a> explain everything about rockets in great detail.</p>
      <pre><code class="language-ts">const x = 1;</code></pre></main>
    <footer><a href="mailto:hi@acme.test">Contact</a></footer>
  </body></html>`;
  const doc = parseDocument(page);

  it("extracts metadata", () => {
    const m = extractMetadata(doc, { url: "https://acme.test", finalUrl: "https://acme.test/", statusCode: 200, contentType: "text/html" });
    expect(m).toMatchObject({ title: "Acme | Rockets for everyone", description: "We build rockets.", language: "en", image: "https://acme.test/og.png", favicon: "https://acme.test/favicon.svg" });
  });

  it("cleans boilerplate and converts to markdown with code fences", () => {
    const html = cleanHtml(doc, { baseUrl: "https://acme.test/", onlyMainContent: true, blockAds: true });
    const md = htmlToMarkdown(html);
    expect(md).toContain("# Rockets");
    expect(md).toContain("```ts\nconst x = 1;\n```");
    expect(md).toContain("(https://acme.test/docs?utm_source=x)");
    expect(md).not.toContain("cookies");
    expect(md).not.toContain("Pricing");
  });

  it("extracts absolute links", () => {
    expect(extractLinks(doc, "https://acme.test/")).toContain("https://acme.test/pricing");
  });

  it("extracts a brand", () => {
    const b = extractBrandFromHtml(doc, "https://acme.test/");
    expect(b.name).toBe("Acme");
    expect(b.slogan).toBe("Rockets for everyone");
    expect(b.logos[0]?.url).toBe("https://acme.test/logo.svg");
    expect(b.colors).toContain("#ff4f1a");
    expect(b.socials.map((s) => s.network).sort()).toEqual(["github", "x"]);
    expect(b.email).toBe("hi@acme.test");
  });

  it("detects SPA shells and challenges", () => {
    const shell = '<html><body><div id="root"></div><script src="/app.js"></script></body></html>';
    expect(needsJavaScript(parseDocument(shell), shell)).toBe(true);
    expect(needsJavaScript(doc, page)).toBe(false);
    expect(isBlocked(403, "")).toBe(true);
    expect(isBlocked(200, "<title>Just a moment...</title><script>window._cf_chl_opt={}</script>")).toBe(true);
    expect(isBlocked(200, page)).toBe(false);
  });
});

describe("products", () => {
  it("reads schema.org products", () => {
    const html = `<script type="application/ld+json">{"@type":"Product","name":"Boot","sku":"B1","image":["/b.jpg"],"brand":{"@type":"Brand","name":"Acme"},
      "offers":{"@type":"Offer","price":"129.00","priceCurrency":"EUR","availability":"https://schema.org/InStock"},
      "aggregateRating":{"ratingValue":4.6,"reviewCount":88}}</script>`;
    const [p] = productsFromStructuredData(parseDocument(html), "https://shop.test/p/boot");
    expect(p).toMatchObject({ name: "Boot", sku: "B1", brand: "Acme", price: 129, currency: "EUR", availability: "in_stock", rating: 4.6, reviewCount: 88, images: ["https://shop.test/b.jpg"] });
  });
});

describe("urls", () => {
  it("normalises tracking params and trailing slashes", () => {
    expect(normaliseUrl("https://A.com/x/?utm_source=1&b=2&a=1#frag")).toBe("https://a.com/x?a=1&b=2");
  });
  it("matches paths", () => {
    const m = pathMatcher(["/blog/**"], ["/blog/drafts/**"]);
    expect(m("https://a.com/blog/post")).toBe(true);
    expect(m("https://a.com/blog/drafts/x")).toBe(false);
    expect(m("https://a.com/about")).toBe(false);
  });
  it("compares sites", () => {
    expect(sameSite("https://www.a.com/x", "https://a.com", false)).toBe(true);
    expect(sameSite("https://docs.a.com", "https://a.com", false)).toBe(false);
    expect(sameSite("https://docs.a.com", "https://a.com", true)).toBe(true);
  });
});

describe("parse & diff", () => {
  it("parses csv into a table", async () => {
    const r = await parseDocumentBytes(Buffer.from('name,note\nA,"x, y"\nB,"say ""hi"""\n'), { contentType: "text/csv" });
    expect(r.markdown).toBe('| name | note |\n| --- | --- |\n| A | x, y |\n| B | say "hi" |');
  });
  it("sniffs pdf magic bytes", () => expect(detectKind(Buffer.from("%PDF-1.7"), "application/octet-stream")).toBe("pdf"));
  it("diffs text and sets", () => {
    expect(diffText("a\nb\n", "a\nb\n")).toBeNull();
    expect(diffText("a\nb\n", "a\nc\n")).toMatchObject({ added: 1, removed: 1 });
    expect(diffSets(["a", "b"], ["b", "c"])).toEqual({ added: ["c"], removed: ["a"] });
  });
  it("normalises colors", () => {
    expect(normaliseHex("#ABC")).toBe("#aabbcc");
    expect(isNeutral("#777777")).toBe(true);
    expect(isNeutral("#ff4f1a")).toBe(false);
  });
});
