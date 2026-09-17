import type { LlmTasks } from "@pluck/ai";
import {
  absolute,
  colorsFromCss,
  decodeBody,
  extractBrandFromHtml,
  normaliseHex,
  parseDocument,
  registrableDomain,
} from "@pluck/core";
import { brands } from "@pluck/db";
import { type Brand, type BrandQuery, PluckError } from "@pluck/shared";
import { eq } from "drizzle-orm";
import type { Services } from "../services.js";

const FREE_MAIL = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "yahoo.com",
  "ymail.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "pm.me",
  "gmx.com",
  "gmx.de",
  "web.de",
  "yandex.com",
  "yandex.ru",
  "mail.ru",
  "zoho.com",
  "fastmail.com",
  "hey.com",
  "tutanota.com",
  "qq.com",
  "163.com",
  "126.com",
  "rediffmail.com",
]);

const NOT_OFFICIAL =
  /(^|\.)(wikipedia\.org|linkedin\.com|facebook\.com|x\.com|twitter\.com|instagram\.com|youtube\.com|crunchbase\.com|bloomberg\.com|reuters\.com|yahoo\.com|google\.com|reddit\.com|glassdoor\.com|indeed\.com|marketwatch\.com|cnbc\.com|forbes\.com|nasdaq\.com|nyse\.com)$/;

const NSFW = /\b(porn|xxx|sex|nsfw|adult|escort|camgirl|hentai|onlyfans)\b/i;

export class BrandService {
  constructor(private readonly s: Services) {}

  async resolveDomain(q: BrandQuery): Promise<string> {
    if (q.domain) return registrableDomain(`https://${q.domain}`) || q.domain;
    if (q.email) {
      const host = q.email.split("@")[1]!.toLowerCase();
      if (FREE_MAIL.has(host))
        throw new PluckError(
          "bad_request",
          "That is a personal email provider, not a company domain.",
        );
      return registrableDomain(`https://${host}`) || host;
    }
    const query = q.ticker
      ? `${q.ticker} stock company official website investor relations`
      : `${q.name} official website`;
    const hits = await this.s.search.search({ query, limit: 8, category: "web" });
    for (const hit of hits) {
      const host = new URL(hit.url).hostname.replace(/^www\./, "");
      if (!NOT_OFFICIAL.test(host)) return registrableDomain(hit.url) || host;
    }
    throw new PluckError("not_found", "Could not find an official website for that company.");
  }

  async get(
    domain: string,
    opts: { maxAge: number; proxy: BrandQuery["proxy"]; llm: LlmTasks | null },
  ): Promise<{ brand: Brand; cached: boolean }> {
    const [row] = await this.s.db.select().from(brands).where(eq(brands.domain, domain));
    if (row && Date.now() - row.updatedAt.getTime() <= opts.maxAge * 1000) {
      return { brand: row.data as Brand, cached: true };
    }

    const { result } = await this.s
      .scraper()
      .scrape({
        url: `https://${domain}`,
        formats: ["rawHtml"],
        onlyMainContent: false,
        render: "auto",
        proxy: opts.proxy,
        timeout: 30_000,
        maxAge: 86_400,
        blockAds: false,
        respectRobots: false,
        mobile: false,
      })
      .catch((err: unknown) => {
        throw err instanceof PluckError && err.code === "target_unreachable"
          ? new PluckError("not_found", `Could not reach ${domain}.`)
          : err;
      });

    const base = result.metadata.finalUrl;
    const doc = parseDocument(result.rawHtml ?? "");
    const stat = extractBrandFromHtml(doc, base);
    const manifest = stat.manifestUrl ? await this.manifest(stat.manifestUrl) : null;

    const logos = [...stat.logos];
    for (const icon of manifest?.icons ?? []) {
      const url = absolute(icon.src, stat.manifestUrl ?? base);
      const size = /(\d+)x(\d+)/.exec(icon.sizes ?? "");
      if (url && !logos.some((l) => l.url === url)) {
        logos.push({
          url,
          type: "icon",
          format: icon.type?.split("/")[1] ?? null,
          width: size ? Number(size[1]) : null,
          height: size ? Number(size[2]) : null,
          theme: null,
        });
      }
    }

    const colors = [
      ...new Set(
        [normaliseHex(manifest?.theme_color), ...stat.colors].filter((c): c is string =>
          Boolean(c),
        ),
      ),
    ];
    // Most sites keep their palette in external CSS rather than inline styles.
    if (colors.length < 3 && stat.stylesheets.length) {
      const css = await this.fetchCss(stat.stylesheets);
      for (const hex of colorsFromCss(css)) if (!colors.includes(hex)) colors.push(hex);
    }

    let industries: Brand["industries"] = null;
    if (opts.llm && (stat.description || stat.name)) {
      industries = await opts.llm
        .classify({ domain, name: stat.name, description: stat.description })
        .then((r) => r.data)
        .catch(() => null);
    }

    const brand: Brand = {
      domain,
      name: stat.name ?? manifest?.name ?? null,
      title: stat.title,
      description: stat.description,
      slogan: stat.slogan,
      logos,
      colors: colors.slice(0, 6).map((hex) => ({ hex, name: null })),
      fonts: stat.fonts,
      socials: stat.socials,
      address: stat.address,
      email: stat.email,
      phone: stat.phone,
      stock: stat.stock,
      industries,
      isNsfw: NSFW.test(`${stat.title} ${stat.description} ${domain}`),
      updatedAt: new Date().toISOString(),
    };

    await this.s.db
      .insert(brands)
      .values({ domain, data: brand })
      .onConflictDoUpdate({ target: brands.domain, set: { data: brand, updatedAt: new Date() } });
    return { brand, cached: false };
  }

  /** Reads a couple of stylesheets, capped in size, ignoring failures. */
  private async fetchCss(urls: string[]): Promise<string> {
    const sheets = await Promise.all(
      urls.slice(0, 3).map(async (url) => {
        try {
          const res = await this.s.http.fetch(url, { timeout: 8_000, maxBytes: 2 * 1024 * 1024 });
          return res.status < 400 ? decodeBody(res.body, res.contentType) : "";
        } catch {
          return "";
        }
      }),
    );
    return sheets.join("\n");
  }

  private async manifest(url: string) {
    try {
      const res = await this.s.http.fetch(url, { timeout: 5_000, maxBytes: 256 * 1024 });
      if (res.status >= 400) return null;
      return JSON.parse(decodeBody(res.body, res.contentType)) as {
        name?: string;
        theme_color?: string;
        icons?: { src: string; sizes?: string; type?: string }[];
      };
    } catch {
      return null;
    }
  }
}
