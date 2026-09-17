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
