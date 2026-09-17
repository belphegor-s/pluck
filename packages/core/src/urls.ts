import picomatch from "picomatch";
import { getDomain, getHostname } from "tldts";

/** Canonical form used for de-duplication during crawls and maps. */
export function normaliseUrl(raw: string, { dropQuery = false }: { dropQuery?: boolean } = {}): string | null {
  try {
    const url = new URL(raw);
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    if (dropQuery) url.search = "";
    else {
      for (const key of [...url.searchParams.keys()]) {
        if (/^(utm_|fbclid$|gclid$|mc_|ref$|ref_src$)/i.test(key)) url.searchParams.delete(key);
      }
      url.searchParams.sort();
    }
    if (url.pathname !== "/" && url.pathname.endsWith("/")) url.pathname = url.pathname.slice(0, -1);
    return url.href;
  } catch {
    return null;
  }
}

export const registrableDomain = (url: string) => getDomain(url) ?? getHostname(url) ?? "";

export function sameSite(a: string, b: string, allowSubdomains: boolean): boolean {
  const ha = getHostname(a)?.replace(/^www\./, "");
  const hb = getHostname(b)?.replace(/^www\./, "");
  if (!ha || !hb) return false;
  return ha === hb || (allowSubdomains && registrableDomain(a) === registrableDomain(b));
}

const ASSET_EXT = /\.(png|jpe?g|gif|webp|avif|svg|ico|bmp|tiff?|mp4|webm|mov|avi|mkv|mp3|wav|ogg|flac|zip|gz|tgz|rar|7z|exe|dmg|pkg|deb|rpm|iso|woff2?|ttf|otf|eot|css|js|mjs|map)$/i;

export const isLikelyPage = (url: string) => !ASSET_EXT.test(new URL(url).pathname);

export function pathMatcher(include?: string[], exclude?: string[]) {
  const inc = include?.length ? picomatch(include, { dot: true }) : null;
  const exc = exclude?.length ? picomatch(exclude, { dot: true }) : null;
  return (url: string) => {
    const path = new URL(url).pathname;
    return (!inc || inc(path)) && !(exc?.(path));
  };
}

/** Cheap lexical relevance for `map` search ranking. */
export function relevance(url: string, query: string): number {
  const terms = query.toLowerCase().split(/\W+/).filter(Boolean);
  const hay = decodeURIComponent(url).toLowerCase();
  let score = 0;
  for (const t of terms) if (hay.includes(t)) score += 1 + t.length / 10;
  return score - hay.length / 1000;
}
