import { Readability } from "@mozilla/readability";
import { NodeHtmlMarkdown } from "node-html-markdown";
import { absolute, type Doc, parseDocument } from "./document.js";

const ALWAYS_REMOVE = [
  "script",
  "style",
  "noscript",
  "template",
  "iframe",
  "object",
  "embed",
  "canvas",
  "link",
  "meta",
  "base",
];

const BOILERPLATE = [
  "nav",
  "header",
  "footer",
  "aside",
  "form",
  "dialog",
  '[role="navigation"]',
  '[role="banner"]',
  '[role="contentinfo"]',
  '[role="dialog"]',
  '[role="alert"]',
  '[aria-modal="true"]',
  '[aria-hidden="true"]',
  "[hidden]",
  ".sidebar",
  "#sidebar",
  ".breadcrumbs",
  ".breadcrumb",
  ".share",
  ".social",
  ".newsletter",
  ".related",
  ".comments",
  "#comments",
  ".skip-link",
];

const AD_OR_CONSENT =
  /(^|[\s_-])(ad|ads|advert|advertisement|sponsor|sponsored|promo|banner-ad|cookie|cookies|consent|gdpr|onetrust|cmp|popup|modal|overlay|newsletter-signup|paywall)([\s_-]|$)/i;

export interface ContentOptions {
  baseUrl: string;
  onlyMainContent: boolean;
  includeTags?: string[];
  excludeTags?: string[];
  blockAds: boolean;
}

/**
 * Produces cleaned HTML. Strategy: strip scripts/styles, apply user tag
 * filters, then either run Readability (article-like pages) or a
 * boilerplate-removal pass that preserves app-like pages Readability
 * would mangle (docs, pricing tables, listings).
 */
export function cleanHtml(doc: Doc, opts: ContentOptions): string {
  const root = doc.cloneNode(true) as Doc;
  for (const el of root.querySelectorAll(ALWAYS_REMOVE.join(","))) el.remove();
  for (const el of root.querySelectorAll("svg")) el.remove();

  if (opts.excludeTags?.length) {
    for (const el of root.querySelectorAll(opts.excludeTags.join(","))) el.remove();
  }

  let body: Element | null = root.body;
  if (opts.includeTags?.length) {
    const container = root.createElement("div");
    for (const el of root.querySelectorAll(opts.includeTags.join(",")))
      container.appendChild(el.cloneNode(true));
    body = container;
  }
  if (!body) return "";

  if (opts.blockAds) {
    for (const el of body.querySelectorAll("[class], [id]")) {
      const tag = el.tagName;
      if (tag === "BODY" || tag === "MAIN" || tag === "ARTICLE" || tag === "HTML") continue;
      const sig = `${el.getAttribute("class") ?? ""} ${el.getAttribute("id") ?? ""}`;
      if (AD_OR_CONSENT.test(sig)) el.remove();
    }
  }

  if (opts.onlyMainContent && !opts.includeTags?.length) {
    const main = pickMain(root, body);
    if (main) body = main;
  }

  absolutise(body, opts.baseUrl);
  return body.innerHTML;
}

function pickMain(root: Doc, body: Element): Element | null {
  const bodyTextLength = (body.textContent ?? "").trim().length;

  // Readability works on a disposable copy; it mutates its input.
  try {
    const clone = root.cloneNode(true) as Doc;
    const article = new Readability(clone, { charThreshold: 300, keepClasses: true }).parse();
    if (
      article?.content &&
      (article.textContent ?? "").trim().length > Math.min(500, bodyTextLength * 0.4)
    ) {
      const container = parseDocument(`<div>${article.content}</div>`).querySelector("div");
      if (container) {
        // Readability lifts the headline into `title`; put it back.
        const heading =
          body.querySelector("main h1, article h1, h1")?.textContent?.trim() || article.title;
        if (heading && !container.querySelector("h1")) {
          const h1 = container.ownerDocument.createElement("h1");
          h1.textContent = heading;
          container.prepend(h1);
        }
        return container;
      }
    }
  } catch {
    // Fall through to heuristic extraction.
  }

  const candidate =
    body.querySelector("main") ??
    body.querySelector('[role="main"]') ??
    body.querySelector("article") ??
    body;
  for (const el of candidate.querySelectorAll(BOILERPLATE.join(","))) {
    if (el !== candidate && !el.contains(candidate)) el.remove();
  }
  return candidate;
}

function absolutise(root: Element, base: string) {
  for (const a of root.querySelectorAll("a[href]")) {
    const abs = absolute(a.getAttribute("href"), base);
    if (abs) a.setAttribute("href", abs);
    else if (!a.getAttribute("href")?.startsWith("mailto:")) a.removeAttribute("href");
  }
  for (const img of root.querySelectorAll("img")) {
    const src = pickImageSrc(img, base);
    if (src) img.setAttribute("src", src);
    else img.remove();
  }
}

export function pickImageSrc(img: Element, base: string): string | null {
  const candidates = [
    img.getAttribute("src"),
    img.getAttribute("data-src"),
    img.getAttribute("data-lazy-src"),
    img.getAttribute("data-original"),
    img.getAttribute("srcset")?.split(",").pop()?.trim().split(/\s+/)[0],
  ];
  for (const c of candidates) {
    if (c && !c.startsWith("data:")) {
      const abs = absolute(c, base);
      if (abs) return abs;
    }
  }
  return null;
}

const nhm = new NodeHtmlMarkdown(
  {
    bulletMarker: "-",
    codeBlockStyle: "fenced",
    maxConsecutiveNewlines: 2,
    useLinkReferenceDefinitions: false,
    keepDataImages: false,
    ignore: ["button", "input", "select", "textarea"],
  },
  {
    pre: ({ node }) => {
      const code = node.querySelector("code");
      const cls = `${code?.getAttribute("class") ?? ""} ${node.getAttribute("class") ?? ""}`;
      const lang = /(?:language|lang)-([\w+#-]+)/.exec(cls)?.[1] ?? "";
      const content = (code ?? node).textContent ?? "";
      const fence = content.includes("```") ? "````" : "```";
      return {
        content: `\n${fence}${lang}\n${content.replace(/\n$/, "")}\n${fence}\n`,
        noEscape: true,
        preserveWhitespace: true,
        ignore: false,
        recurse: false,
      } as never;
    },
  },
);

export function htmlToMarkdown(html: string): string {
  return (
    nhm
      .translate(html)
      // node-html-markdown percent-encodes "_" and "*" in URLs; they are valid inside (...).
      .replace(
        /\]\(([^)\s]+)/g,
        (_m, url: string) => `](${url.replace(/%5F/g, "_").replace(/%2A/g, "*")}`,
      )
      .replace(/\[\s*\]\([^)]*\)/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

export function htmlToText(html: string): string {
  const doc = parseDocument(`<div>${html}</div>`);
  for (const el of doc.querySelectorAll("br")) el.replaceWith("\n");
  for (const el of doc.querySelectorAll("p,div,li,h1,h2,h3,h4,h5,h6,tr,section,article"))
    el.append("\n");
  return (doc.textContent ?? "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

export function extractLinks(doc: Doc, base: string): string[] {
  const seen = new Set<string>();
  for (const a of doc.querySelectorAll("a[href]")) {
    const abs = absolute(a.getAttribute("href"), base);
    if (abs) seen.add(abs);
  }
  return [...seen];
}

export function extractImages(doc: Doc, base: string) {
  const seen = new Map<
    string,
    { src: string; alt: string | null; width: number | null; height: number | null }
  >();
  const num = (v: string | null) => (v && /^\d+$/.test(v) ? Number(v) : null);
  for (const img of doc.querySelectorAll("img")) {
    const src = pickImageSrc(img, base);
    if (!src || seen.has(src)) continue;
    seen.set(src, {
      src,
      alt: img.getAttribute("alt")?.trim() || null,
      width: num(img.getAttribute("width")),
      height: num(img.getAttribute("height")),
    });
  }
  const og = absolute(
    doc.querySelector('meta[property="og:image"]')?.getAttribute("content"),
    base,
  );
  if (og && !seen.has(og)) seen.set(og, { src: og, alt: null, width: null, height: null });
  return [...seen.values()];
}
