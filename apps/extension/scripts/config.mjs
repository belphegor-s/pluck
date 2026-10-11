import { BRAND, credits, EXTENSION_MESSAGE, SIGNUP_GRANT } from "@pluck/shared";

const trim = (url) => url.replace(/\/+$/, "");

/**
 * Everything the bundle knows about the product, injected as `__PLUCK__`.
 * The build and the tests both get it from here, so they cannot drift.
 */
export function createBuildConfig({ version, dev = false }) {
  return {
    name: BRAND.name,
    slug: BRAND.slug,
    tagline: BRAND.tagline,
    version,
    dev,
    siteUrl: trim(process.env.PLUCK_SITE_URL ?? BRAND.siteUrl),
    apiUrl: trim(process.env.PLUCK_API_URL ?? BRAND.apiUrl),
    repoUrl: BRAND.repoUrl,
    contactEmail: BRAND.contactEmail,
    keyPrefix: BRAND.apiKeyFamily,
    signupGrant: SIGNUP_GRANT,
    credits,
    message: EXTENSION_MESSAGE,
  };
}
