import type { MapRequest, MapResult } from "@pluck/shared";
import { extractLinks } from "./html/content.js";
import { parseDocument } from "./html/document.js";
import { decodeBody, type HttpClient } from "./net/fetch.js";
import type { RobotsCache } from "./robots.js";
import { readSitemaps } from "./sitemap.js";
import { isLikelyPage, normaliseUrl, relevance, sameSite } from "./urls.js";

export async function mapSite(
  http: HttpClient,
  robots: RobotsCache,
  req: MapRequest,
): Promise<MapResult> {
  const origin = new URL(req.url).origin;
  const proxy = http.proxies.ladder(req.proxy)[0] ?? "none";
  const found = new Map<string, string | null>();
  const sources: string[] = [];

  const add = (raw: string, lastmod: string | null) => {
    const url = normaliseUrl(raw);
    if (!url || !sameSite(url, req.url, req.includeSubdomains) || !isLikelyPage(url)) return;
    if (!found.has(url) || (lastmod && !found.get(url))) found.set(url, lastmod);
  };

  const [sitemaps, homepage] = await Promise.all([
    req.useSitemap ? readSitemaps(http, robots, origin, { limit: req.limit * 2, proxy }) : null,
    http.fetch(req.url, { proxy, timeout: 15_000 }).catch(() => null),
  ]);

  if (sitemaps) {
    sources.push(...sitemaps.sources);
    for (const e of sitemaps.entries) add(e.url, e.lastmod);
  }
  if (homepage && homepage.status < 400) {
    sources.push(homepage.finalUrl);
    add(homepage.finalUrl, null);
    for (const link of extractLinks(
      parseDocument(decodeBody(homepage.body, homepage.contentType)),
      homepage.finalUrl,
    )) {
      add(link, null);
    }
  }

  let links = [...found].map(([url, lastmod]) => ({ url, lastmod }));
  if (req.search) {
    const q = req.search;
    links = links
      .map((l) => ({ l, s: relevance(l.url, q) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.l);
  }
  return { links: links.slice(0, req.limit), sources };
}
