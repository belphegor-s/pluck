import type { PageMetadata } from "@pluck/shared";
import { absolute, attr, type Doc, text } from "./document.js";

export function extractMetadata(
  doc: Doc,
  {
    url,
    finalUrl,
    statusCode,
    contentType,
  }: { url: string; finalUrl: string; statusCode: number; contentType: string | null },
): PageMetadata {
  const og: Record<string, string> = {};
  for (const meta of doc.querySelectorAll("meta[property], meta[name]")) {
    const key = (meta.getAttribute("property") ?? meta.getAttribute("name") ?? "").trim();
    const content = meta.getAttribute("content")?.trim();
    if (content && /^(og|twitter|article|product):/i.test(key)) og[key.toLowerCase()] = content;
  }
  const meta = (name: string) => attr(doc, `meta[name="${name}" i]`, "content");
  const jsonLd = readJsonLd(doc);
  const ldArticle = jsonLd.find((n) => /Article|BlogPosting|NewsArticle/.test(String(n["@type"])));

  const favicon =
    absolute(attr(doc, 'link[rel~="icon" i]', "href"), finalUrl) ??
    absolute(attr(doc, 'link[rel="shortcut icon" i]', "href"), finalUrl) ??
    new URL("/favicon.ico", finalUrl).href;

  return {
    url,
    finalUrl,
    statusCode,
    contentType,
    title: og["og:title"] ?? (text(doc.querySelector("title")) || null),
    description: meta("description") ?? og["og:description"] ?? og["twitter:description"] ?? null,
    language: doc.documentElement?.getAttribute("lang")?.trim() || null,
    canonical: absolute(attr(doc, 'link[rel="canonical" i]', "href"), finalUrl),
    siteName: og["og:site_name"] ?? null,
    author: meta("author") ?? ldName(ldArticle?.author) ?? null,
    publishedAt:
      og["article:published_time"] ??
      (typeof ldArticle?.datePublished === "string" ? ldArticle.datePublished : null),
    image: absolute(og["og:image"] ?? og["twitter:image"], finalUrl),
    favicon,
    keywords: (meta("keywords") ?? "")
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean)
      .slice(0, 50),
    og,
  };
}

type LdNode = Record<string, unknown>;

export function readJsonLd(doc: Doc): LdNode[] {
  const nodes: LdNode[] = [];
  for (const script of doc.querySelectorAll('script[type="application/ld+json" i]')) {
    try {
      const parsed: unknown = JSON.parse(script.textContent ?? "");
      const visit = (v: unknown) => {
        if (Array.isArray(v)) v.forEach(visit);
        else if (v && typeof v === "object") {
          const node = v as LdNode;
          nodes.push(node);
          if (Array.isArray(node["@graph"])) node["@graph"].forEach(visit);
        }
      };
      visit(parsed);
    } catch {
      // Invalid JSON-LD is common in the wild; ignore it.
    }
  }
  return nodes;
}

export const ldTypes = (node: LdNode): string[] =>
  (Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]]).filter(
    (t): t is string => typeof t === "string",
  );

const ldName = (v: unknown): string | null => {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return ldName(v[0]);
  if (v && typeof v === "object" && typeof (v as LdNode).name === "string")
    return (v as LdNode).name as string;
  return null;
};
