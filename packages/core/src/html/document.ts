import { parseHTML } from "linkedom";

export type Doc = Document;

export function parseDocument(html: string): Doc {
  return parseHTML(html).document as unknown as Doc;
}

export const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, " ").trim() ?? "";

export function absolute(href: string | null | undefined, base: string): string | null {
  if (!href) return null;
  const trimmed = href.trim();
  if (!trimmed || /^(javascript|mailto|tel|data|about|blob):/i.test(trimmed) || trimmed.startsWith("#")) return null;
  try {
    const url = new URL(trimmed, base);
    url.hash = "";
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

export function attr(doc: Doc, selector: string, name: string): string | null {
  const v = doc.querySelector(selector)?.getAttribute(name)?.trim();
  return v ? v : null;
}
