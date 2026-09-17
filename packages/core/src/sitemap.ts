import { gunzipSync } from "node:zlib";
import { XMLParser } from "fast-xml-parser";
import type { HttpClient } from "./net/fetch.js";
import type { ProxyUsed } from "./net/proxy.js";
import type { RobotsCache } from "./robots.js";

export interface SitemapEntry {
  url: string;
  lastmod: string | null;
}

const xml = new XMLParser({ ignoreAttributes: true, processEntities: true, htmlEntities: true });
const asArray = <T>(v: T | T[] | undefined): T[] =>
  v === undefined ? [] : Array.isArray(v) ? v : [v];

/**
 * Collects URLs from robots.txt sitemaps and conventional locations,
 * following sitemap indexes (bounded) and gzip sitemaps.
 */
export async function readSitemaps(
  http: HttpClient,
  robots: RobotsCache,
  origin: string,
  {
    limit,
    proxy = "none",
    maxSitemaps = 50,
  }: { limit: number; proxy?: ProxyUsed; maxSitemaps?: number },
): Promise<{ entries: SitemapEntry[]; sources: string[] }> {
  const queue = [
    ...new Set([
      ...(await robots.sitemaps(origin)),
      `${origin}/sitemap.xml`,
      `${origin}/sitemap_index.xml`,
    ]),
  ];
  const visited = new Set<string>();
  const entries = new Map<string, SitemapEntry>();
  const sources: string[] = [];

  while (queue.length && visited.size < maxSitemaps && entries.size < limit) {
    const batch = queue.splice(0, 8).filter((u) => !visited.has(u));
    for (const u of batch) visited.add(u);
    await Promise.all(
      batch.map(async (sitemapUrl) => {
        try {
          const res = await http.fetch(sitemapUrl, {
            timeout: 15_000,
            proxy,
            maxBytes: 50 * 1024 * 1024,
          });
          if (res.status !== 200) return;
          let body = res.body;
          if (body[0] === 0x1f && body[1] === 0x8b) body = gunzipSync(body);
          const text = body.toString("utf8");
          if (!/<(urlset|sitemapindex)/i.test(text.slice(0, 2000))) return;
          const doc = xml.parse(text);
          sources.push(sitemapUrl);
          for (const sm of asArray<{ loc?: string }>(doc.sitemapindex?.sitemap)) {
            if (sm.loc && !visited.has(sm.loc.trim())) queue.push(sm.loc.trim());
          }
          for (const u of asArray<{ loc?: string; lastmod?: string }>(doc.urlset?.url)) {
            if (entries.size >= limit) break;
            const loc = u.loc?.toString().trim();
            if (loc) entries.set(loc, { url: loc, lastmod: u.lastmod ? String(u.lastmod) : null });
          }
        } catch {
          // Missing or malformed sitemaps are expected; skip them.
        }
      }),
    );
  }
  return { entries: [...entries.values()], sources };
}
