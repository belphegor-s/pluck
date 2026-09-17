import { createRequire } from "node:module";
import { LRUCache } from "lru-cache";
import type { HttpClient } from "./net/fetch.js";

export const PLUCK_BOT = "PluckBot";

interface Robots {
  isAllowed(url: string, ua?: string): boolean | undefined;
  getSitemaps(): string[];
}

// robots-parser is CommonJS with `module.exports = fn` but ships ESM-style typings.
const robotsParser = createRequire(import.meta.url)("robots-parser") as (url: string, body: string) => Robots;

/** robots.txt per origin, cached for an hour. Missing/failed robots means allow. */
export class RobotsCache {
  private readonly cache = new LRUCache<string, Promise<Robots | null>>({ max: 20_000, ttl: 3_600_000 });

  constructor(private readonly http: HttpClient) {}

  private load(origin: string): Promise<Robots | null> {
    let entry = this.cache.get(origin);
    if (!entry) {
      const url = `${origin}/robots.txt`;
      entry = this.http
        .fetch(url, { timeout: 5_000, maxBytes: 512 * 1024 })
        .then((res) => (res.status >= 200 && res.status < 300 ? robotsParser(url, res.body.toString("utf8")) : null))
        .catch(() => null);
      this.cache.set(origin, entry);
    }
    return entry;
  }

  async isAllowed(url: string): Promise<boolean> {
    const robots = await this.load(new URL(url).origin);
    return robots?.isAllowed(url, PLUCK_BOT) ?? true;
  }

  async sitemaps(origin: string): Promise<string[]> {
    return (await this.load(origin))?.getSitemaps() ?? [];
  }
}
