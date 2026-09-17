import { PluckError, type SearchHit, type SearchRequest } from "@pluck/shared";
import { fetch } from "undici";

type Hit = Omit<SearchHit, "page">;

export interface SearchProvider {
  readonly name: string;
  search(req: SearchRequest): Promise<Hit[]>;
}

const timeRangeMap = { day: "d", week: "w", month: "m", year: "y" } as const;

async function getJson<T>(
  url: string,
  init: { headers?: Record<string, string>; method?: string; body?: string } = {},
): Promise<T> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
  if (!res.ok)
    throw new PluckError(
      "target_unreachable",
      `Search provider responded with HTTP ${res.status}.`,
    );
  return (await res.json()) as T;
}

/** Self-hosted metasearch. Zero cost, no API key. */
export class SearxngProvider implements SearchProvider {
  readonly name = "searxng";
  constructor(private readonly baseUrl: string) {}

  async search(req: SearchRequest): Promise<Hit[]> {
    const params = new URLSearchParams({
      q: req.query,
      format: "json",
      categories: req.category === "web" ? "general" : req.category,
      safesearch: "1",
    });
    if (req.language) params.set("language", req.language);
    else if (req.country) params.set("language", `en-${req.country.toUpperCase()}`);
    if (req.timeRange) params.set("time_range", req.timeRange);

    const hits: Hit[] = [];
    for (let page = 1; page <= 3 && hits.length < req.limit; page++) {
      params.set("pageno", String(page));
      const data = await getJson<{
        results: {
          url: string;
          title: string;
          content?: string;
          publishedDate?: string;
          img_src?: string;
          thumbnail?: string;
          engine?: string;
        }[];
      }>(`${this.baseUrl.replace(/\/$/, "")}/search?${params}`);
      if (!data.results.length) break;
      for (const r of data.results) {
        if (hits.some((h) => h.url === r.url)) continue;
        hits.push({
          url: r.url,
          title: r.title,
          snippet: r.content ?? "",
          publishedAt: r.publishedDate ?? null,
          image: r.img_src ?? r.thumbnail ?? null,
          source: r.engine ?? null,
        });
      }
    }
    return hits.slice(0, req.limit);
  }
}

export class BraveProvider implements SearchProvider {
  readonly name = "brave";
  constructor(private readonly apiKey: string) {}

  async search(req: SearchRequest): Promise<Hit[]> {
    const kind = req.category === "web" ? "web" : req.category;
    const params = new URLSearchParams({ q: req.query, count: String(Math.min(req.limit, 20)) });
    if (req.country) params.set("country", req.country);
    if (req.language) params.set("search_lang", req.language.slice(0, 2));
    if (req.timeRange) params.set("freshness", `p${timeRangeMap[req.timeRange]}`);
    const data = await getJson<{
      web?: { results: BraveResult[] };
      results?: BraveResult[];
    }>(`https://api.search.brave.com/res/v1/${kind}/search?${params}`, {
      headers: { "x-subscription-token": this.apiKey, accept: "application/json" },
    });
    return (data.web?.results ?? data.results ?? []).slice(0, req.limit).map((r) => ({
      url: r.url,
      title: r.title,
      snippet: stripTags(r.description ?? ""),
      publishedAt: r.page_age ?? r.age ?? null,
      image: r.thumbnail?.src ?? r.properties?.url ?? null,
      source: r.meta_url?.hostname ?? null,
    }));
  }
}

interface BraveResult {
  url: string;
  title: string;
  description?: string;
  page_age?: string;
  age?: string;
  thumbnail?: { src?: string };
  properties?: { url?: string };
  meta_url?: { hostname?: string };
}

export class SerperProvider implements SearchProvider {
  readonly name = "serper";
  constructor(private readonly apiKey: string) {}

  async search(req: SearchRequest): Promise<Hit[]> {
    const endpoint = req.category === "web" ? "search" : req.category;
    const data = await getJson<{
      organic?: SerperResult[];
      news?: SerperResult[];
      images?: SerperResult[];
    }>(`https://google.serper.dev/${endpoint}`, {
      method: "POST",
      headers: { "x-api-key": this.apiKey, "content-type": "application/json" },
      body: JSON.stringify({
        q: req.query,
        num: req.limit,
        gl: req.country,
        hl: req.language,
        tbs: req.timeRange ? `qdr:${timeRangeMap[req.timeRange]}` : undefined,
      }),
    });
    return (data.organic ?? data.news ?? data.images ?? []).slice(0, req.limit).map((r) => ({
      url: r.link,
      title: r.title,
      snippet: r.snippet ?? "",
      publishedAt: r.date ?? null,
      image: r.imageUrl ?? null,
      source: r.source ?? null,
    }));
  }
}

interface SerperResult {
  link: string;
  title: string;
  snippet?: string;
  date?: string;
  imageUrl?: string;
  source?: string;
}

/** Tries providers in order; the first one that answers wins. */
export class FallbackSearch implements SearchProvider {
  readonly name: string;
  constructor(private readonly providers: SearchProvider[]) {
    this.name = providers.map((p) => p.name).join(">");
  }

  async search(req: SearchRequest): Promise<Hit[]> {
    if (!this.providers.length)
      throw new PluckError("internal", "No search provider is configured on this instance.");
    let last: unknown;
    for (const p of this.providers) {
      try {
        return await p.search(req);
      } catch (err) {
        last = err;
      }
    }
    throw last;
  }
}

export function searchFromEnv(raw: Readonly<Record<string, unknown>>): FallbackSearch {
  const env = raw as Record<string, string | undefined>;
  const providers: SearchProvider[] = [];
  const order = (env.SEARCH_PROVIDERS ?? "brave,serper,searxng").split(",").map((s) => s.trim());
  for (const name of order) {
    if (name === "brave" && env.BRAVE_API_KEY) providers.push(new BraveProvider(env.BRAVE_API_KEY));
    if (name === "serper" && env.SERPER_API_KEY)
      providers.push(new SerperProvider(env.SERPER_API_KEY));
    if (name === "searxng" && env.SEARXNG_URL) providers.push(new SearxngProvider(env.SEARXNG_URL));
  }
  return new FallbackSearch(providers);
}

const stripTags = (s: string) => s.replace(/<[^>]+>/g, "");
