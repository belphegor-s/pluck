import type { Brand } from "@pluck/shared";
import { absolute, attr, type Doc, text } from "../html/document.js";
import { ldTypes, readJsonLd } from "../html/metadata.js";

type Logo = Brand["logos"][number];

const SOCIAL_HOSTS: [RegExp, string][] = [
  [/(^|\.)(twitter|x)\.com$/, "x"],
  [/(^|\.)linkedin\.com$/, "linkedin"],
  [/(^|\.)github\.com$/, "github"],
  [/(^|\.)facebook\.com$/, "facebook"],
  [/(^|\.)instagram\.com$/, "instagram"],
  [/(^|\.)youtube\.com$/, "youtube"],
  [/(^|\.)tiktok\.com$/, "tiktok"],
  [/(^|\.)discord\.(gg|com)$/, "discord"],
  [/(^|\.)threads\.net$/, "threads"],
  [/(^|\.)bsky\.app$/, "bluesky"],
  [/(^|\.)medium\.com$/, "medium"],
  [/(^|\.)pinterest\.com$/, "pinterest"],
  [/(^|\.)reddit\.com$/, "reddit"],
  [/(^|\.)crunchbase\.com$/, "crunchbase"],
];

const SHARE_PATH = /\/(share|sharer|intent|login|signup|hashtag|search)\b/i;

export interface StaticBrand {
  name: string | null;
  title: string | null;
  description: string | null;
  slogan: string | null;
  logos: Logo[];
  colors: string[];
  fonts: string[];
  socials: Brand["socials"];
  address: Brand["address"];
  email: string | null;
  phone: string | null;
  stock: Brand["stock"];
  manifestUrl: string | null;
  /** Same-origin stylesheets, so callers can mine colors and fonts from them. */
  stylesheets: string[];
}

/** Everything that can be learnt about a brand from its homepage HTML alone. */
export function extractBrandFromHtml(doc: Doc, baseUrl: string): StaticBrand {
  const ld = readJsonLd(doc);
  const org = ld.find((n) =>
    ldTypes(n).some((t) => /Organization|Corporation|LocalBusiness|Store|Brand/.test(t)),
  );
  const site = ld.find((n) => ldTypes(n).includes("WebSite"));
  const og = (p: string) => attr(doc, `meta[property="${p}"]`, "content");
  const title = text(doc.querySelector("title")) || null;

  const name =
    str(org?.name) ??
    og("og:site_name") ??
    str(site?.name) ??
    attr(doc, 'meta[name="application-name"]', "content") ??
    guessNameFromTitle(title);

  const logos: Logo[] = [];
  const pushLogo = (url: string | null, type: Logo["type"], extra: Partial<Logo> = {}) => {
    if (!url || logos.some((l) => l.url === url)) return;
    const format =
      /\.(svg|png|jpe?g|webp|ico|gif|avif)(\?|$)/i
        .exec(url)?.[1]
        ?.toLowerCase()
        .replace("jpeg", "jpg") ?? null;
    logos.push({ url, type, format, width: null, height: null, theme: null, ...extra });
  };

  const orgLogo = org?.logo;
  pushLogo(
    absolute(
      typeof orgLogo === "string"
        ? orgLogo
        : str((orgLogo as Record<string, unknown> | undefined)?.url),
      baseUrl,
    ),
    "logo",
  );

  // Only look where a site's own logo lives. Broad `[class*=logo]` matches
  // customer-logo walls and partner carousels.
  const origin = new URL(baseUrl).origin;
  const homeLinks = `a[href="/"] img, a[href="${origin}"] img, a[href="${origin}/"] img`;
  const logoImgs = [
    ...doc.querySelectorAll(
      `${homeLinks}, header img[alt*="logo" i], header img[class*="logo" i], nav img[alt*="logo" i]`,
    ),
    ...doc.querySelectorAll("header img, nav img"),
  ].slice(0, 8);
  for (const img of logoImgs) {
    if (logos.filter((l) => l.type === "logo").length >= 3) break;
    const src = absolute(img.getAttribute("src"), baseUrl);
    const w = num(img.getAttribute("width"));
    const h = num(img.getAttribute("height"));
    if (!src || (w && h && (w > 600 || h > 200))) continue;
    const theme = /dark|white|light-on-dark|inverse/i.test(`${img.getAttribute("class")} ${src}`)
      ? "dark"
      : null;
    pushLogo(src, "logo", { theme, width: w, height: h });
  }

  for (const link of doc.querySelectorAll(
    'link[rel~="icon" i], link[rel="shortcut icon" i], link[rel="mask-icon" i]',
  )) {
    const size = /(\d+)x(\d+)/.exec(link.getAttribute("sizes") ?? "");
    pushLogo(
      absolute(link.getAttribute("href"), baseUrl),
      "icon",
      size ? { width: Number(size[1]), height: Number(size[2]) } : {},
    );
  }
  for (const link of doc.querySelectorAll('link[rel^="apple-touch-icon" i]')) {
    pushLogo(absolute(link.getAttribute("href"), baseUrl), "apple-touch-icon", {
      width: 180,
      height: 180,
    });
  }
  pushLogo(absolute(og("og:image"), baseUrl), "og");
  if (!logos.some((l) => l.type === "icon"))
    pushLogo(new URL("/favicon.ico", baseUrl).href, "icon");

  const colors = new Map<string, number>();
  const bump = (hex: string | null, weight: number) => {
    const n = normaliseHex(hex);
    if (n) colors.set(n, (colors.get(n) ?? 0) + weight);
  };
  bump(attr(doc, 'meta[name="theme-color"]', "content"), 50);
  bump(attr(doc, 'meta[name="msapplication-TileColor"]', "content"), 20);
  const inlineCss = [...doc.querySelectorAll("style")]
    .map((s) => s.textContent ?? "")
    .join("\n")
    .slice(0, 500_000);
  for (const m of inlineCss.matchAll(
    /--[\w-]*(?:primary|brand|accent|main)[\w-]*\s*:\s*(#[0-9a-f]{3,8})\b/gi,
  ))
    bump(m[1]!, 15);
  for (const m of inlineCss.matchAll(/#[0-9a-f]{6}\b/gi)) bump(m[0], 1);

  const fonts = new Set<string>();
  for (const link of doc.querySelectorAll('link[href*="fonts.googleapis.com"]')) {
    for (const fam of (link.getAttribute("href") ?? "").matchAll(/family=([^&:]+)/g)) {
      fonts.add(decodeURIComponent(fam[1]!).replace(/\+/g, " "));
    }
  }
  for (const m of inlineCss.matchAll(/font-family\s*:\s*["']?([^;"',}]+)/gi)) {
    const f = m[1]!.trim();
    if (
      !/^(inherit|initial|var\(|-apple-system|system-ui|sans-serif|serif|monospace|arial|helvetica)/i.test(
        f,
      )
    )
      fonts.add(f);
  }

  const socials = new Map<string, string>();
  const sameAs = Array.isArray(org?.sameAs)
    ? (org.sameAs as unknown[])
    : typeof org?.sameAs === "string"
      ? [org.sameAs]
      : [];
  const candidateLinks = [
    ...sameAs.filter((v): v is string => typeof v === "string"),
    ...[...doc.querySelectorAll("a[href]")].map((a) => a.getAttribute("href") ?? ""),
  ];
  for (const href of candidateLinks) {
    const abs = absolute(href, baseUrl);
    if (!abs) continue;
    const u = new URL(abs);
    if (SHARE_PATH.test(u.pathname) || u.pathname.length < 2) continue;
    const network = SOCIAL_HOSTS.find(([re]) => re.test(u.hostname))?.[1];
    if (network && !socials.has(network)) socials.set(network, abs);
  }

  const addr = (org?.address ?? null) as Record<string, unknown> | null;
  const mailto =
    doc.querySelector('a[href^="mailto:" i]')?.getAttribute("href")?.slice(7).split("?")[0] ?? null;
  const tel = doc.querySelector('a[href^="tel:" i]')?.getAttribute("href")?.slice(4) ?? null;

  const description =
    attr(doc, 'meta[name="description" i]', "content") ??
    og("og:description") ??
    str(org?.description);

  return {
    name,
    title,
    description,
    slogan: str(org?.slogan) ?? sloganFromTitle(title, name),
    logos,
    colors: [...colors.entries()]
      .filter(([hex]) => !isNeutral(hex))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([hex]) => hex),
    fonts: [...fonts].slice(0, 6),
    socials: [...socials].map(([network, url]) => ({ network, url })),
    address:
      addr && typeof addr === "object"
        ? {
            street: str(addr.streetAddress),
            city: str(addr.addressLocality),
            region: str(addr.addressRegion),
            postalCode: str(addr.postalCode),
            country:
              str((addr.addressCountry as Record<string, unknown> | undefined)?.name) ??
              str(addr.addressCountry),
          }
        : null,
    email: str(org?.email) ?? mailto,
    phone: str(org?.telephone) ?? tel,
    stock: str(org?.tickerSymbol) ? { ticker: str(org?.tickerSymbol)!, exchange: null } : null,
    manifestUrl: absolute(attr(doc, 'link[rel="manifest" i]', "href"), baseUrl),
    stylesheets: [...doc.querySelectorAll('link[rel="stylesheet" i][href]')]
      .map((l) => absolute(l.getAttribute("href"), baseUrl))
      .filter((href): href is string => Boolean(href))
      .slice(0, 4),
  };
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: string | null) => (v && /^\d+$/.test(v) ? Number(v) : null);

function guessNameFromTitle(title: string | null): string | null {
  if (!title) return null;
  const parts = title.split(/\s[|\-–—:·]\s/);
  return (
    (parts.length > 1 ? parts.sort((a, b) => a.length - b.length)[0] : parts[0])?.trim() ?? null
  );
}

function sloganFromTitle(title: string | null, name: string | null): string | null {
  if (!title || !name) return null;
  const rest = title
    .split(/\s[|\-–—:·]\s/)
    .map((s) => s.trim())
    .filter((s) => s.toLowerCase() !== name.toLowerCase());
  return rest.length ? rest.join(" - ") : null;
}

/**
 * Ranks brand colors out of CSS text. Custom properties whose names look like
 * brand tokens win; after that, frequency decides.
 */
export function colorsFromCss(css: string, limit = 6): string[] {
  const scores = new Map<string, number>();
  const bump = (raw: string, weight: number) => {
    const hex = normaliseHex(raw);
    if (hex && !isNeutral(hex)) scores.set(hex, (scores.get(hex) ?? 0) + weight);
  };
  for (const m of css.matchAll(
    /--[\w-]*(?:primary|brand|accent|main|link|cta|action)[\w-]*\s*:\s*(#[0-9a-f]{3,8})\b/gi,
  )) {
    bump(m[1]!, 25);
  }
  for (const m of css.matchAll(
    /(?:background(?:-color)?|color|border-color|fill)\s*:\s*(#[0-9a-f]{6})\b/gi,
  )) {
    bump(m[1]!, 3);
  }
  for (const m of css.matchAll(/#[0-9a-f]{6}\b/gi)) bump(m[0], 1);
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([hex]) => hex);
}

/** Font families declared in CSS, most-used first. */
export function fontsFromCss(css: string, limit = 6): string[] {
  const scores = new Map<string, number>();
  const add = (raw: string, weight: number) => {
    const family = raw.trim().replace(/^["']|["']$/g, "");
    if (!family || GENERIC_FONT.test(family) || family.length > 60) return;
    scores.set(family, (scores.get(family) ?? 0) + weight);
  };
  for (const m of css.matchAll(/@font-face\s*\{[^}]*font-family\s*:\s*([^;}]+)/gi)) add(m[1]!, 20);
  for (const m of css.matchAll(/font-family\s*:\s*([^;}]+)/gi)) add(m[1]!.split(",")[0]!, 1);
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([family]) => family);
}

const GENERIC_FONT =
  /^(inherit|initial|unset|revert|var\(|-apple-system|blinkmacsystemfont|system-ui|ui-\w+|sans-serif|serif|monospace|cursive|fantasy|arial|helvetica|segoe ui|roboto|times|courier|georgia|verdana|tahoma|emoji|icons?)$/i;

export function normaliseHex(input: string | null | undefined): string | null {
  if (!input) return null;
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})([0-9a-f]{2})?$/i.exec(input.trim());
  if (!m) return null;
  const hex = m[1]!.length === 3 ? [...m[1]!].map((c) => c + c).join("") : m[1]!;
  return `#${hex.toLowerCase()}`;
}

/** Greys, near-white and near-black carry no brand signal. */
export function isNeutral(hex: string): boolean {
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max - min < 18;
}
