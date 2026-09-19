import { BRAND } from "@pluck/shared";

/**
 * All product naming comes from `packages/shared/src/identity.ts`.
 * Change it there to rename the product everywhere.
 */
export const SITE = {
  name: BRAND.name,
  tagline: BRAND.tagline,
  description: BRAND.description,
  url: BRAND.siteUrl,
  apiUrl: BRAND.apiUrl,
  mcpUrl: BRAND.mcpUrl,
  repo: BRAND.repoUrl,
  contactEmail: BRAND.contactEmail,
  apiKeyExample: `${BRAND.apiKeyLive}…`,
  sdkPackage: BRAND.npmPackage,
} as const;

export const nav = [
  { href: "/docs", label: "Docs" },
  { href: "/playground", label: "Playground" },
  { href: "/pricing", label: "Pricing" },
  { href: `${SITE.apiUrl}/docs`, label: "API reference", external: true },
] as const;

/**
 * An absolute URL on the public site.
 *
 * Redirects must not be built from `request.url`: inside the container that is
 * the bind address (`http://0.0.0.0:3000`), which then leaks into the browser's
 * address bar. `SITE.url` comes from the deployment's own configuration.
 */
export function siteUrl(path: string, params?: Record<string, string>): URL {
  const url = new URL(path, SITE.url);
  for (const [key, value] of Object.entries(params ?? {})) url.searchParams.set(key, value);
  return url;
}
