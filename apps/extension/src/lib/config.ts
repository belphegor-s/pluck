/**
 * What the build knows about the product. `scripts/build.mjs` reads these from
 * @pluck/shared and injects them, so nothing here is typed in twice.
 */
export interface BuildConfig {
  name: string;
  slug: string;
  tagline: string;
  version: string;
  dev: boolean;
  /** The site: where accounts live and sign-in happens. */
  siteUrl: string;
  /** The hosted API. A self-hosted instance replaces it in settings. */
  apiUrl: string;
  repoUrl: string;
  contactEmail: string;
  /** API keys start with this, such as `pk_`. */
  keyPrefix: string;
  signupGrant: number;
  credits: Record<
    | "scrape"
    | "browserRender"
    | "screenshot"
    | "parse"
    | "map"
    | "search"
    | "llm"
    | "llmByok"
    | "styleguide"
    | "brand",
    number
  >;
  message: { ping: string; connect: string };
}

declare const __PLUCK__: BuildConfig;

export const CONFIG: BuildConfig = __PLUCK__;

/** A link into the site, tagged so visits from the extension can be told apart. */
export function site(path: string, params: Record<string, string> = {}): string {
  const url = new URL(path, CONFIG.siteUrl);
  url.searchParams.set("ref", "extension");
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.href;
}
