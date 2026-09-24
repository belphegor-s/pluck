/**
 * ============================================================================
 *  THE ONLY PLACE THE PRODUCT IS NAMED.
 * ============================================================================
 * Change the values below, run `pnpm build`, and every user-facing surface
 * follows: site copy, page titles, docs, API key prefix (`pk_live_…`), webhook
 * signature header, crawler user agent, MCP tool names and SDK defaults.
 *
 * Internal identifiers (the `@pluck/*` package names, the `PLUCK_` env var
 * prefix and the repository folder) are deliberately not derived from this.
 * Nobody outside the codebase sees them, and keeping them fixed means a rename
 * never breaks a running deployment's configuration.
 */
const config = {
  name: "Pluck",
  slug: "pluck",
  tagline: "the web, ready for your model",
  description:
    "Pluck turns any URL into clean markdown, structured JSON, screenshots and brand data for AI. Open source, self-hostable, and you can bring your own model key.",
  siteUrl: "https://pluck.procd.cc",
  apiUrl: "https://pluck-api.procd.cc",
  mcpUrl: "https://pluck-mcp.procd.cc",
  repoUrl: "https://github.com/belphegor-s/pluck",
  contactEmail: "hello@pluck.procd.cc",
  /** API keys read `<prefix>_live_…`. Changing it invalidates existing keys. */
  apiKeyPrefix: "pk",
  /** Published names. The workspace uses `@pluck/*` internally. */
  npmPackage: "@pluckai/sdk",
  npmMcpPackage: "@pluckai/mcp",
  /** PyPI distribution; also the Python import name. */
  pythonPackage: "pluckai",
} as const;

const env = (key: string): string | undefined => {
  const value = typeof process !== "undefined" ? process.env?.[key] : undefined;
  return value?.trim() || undefined;
};

export const BRAND = {
  ...config,
  /** Domains move without a rebuild; the deployment's env wins. */
  siteUrl: env("NEXT_PUBLIC_SITE_URL") ?? env("PUBLIC_WEB_URL") ?? config.siteUrl,
  apiUrl: env("NEXT_PUBLIC_API_URL") ?? env("PUBLIC_API_URL") ?? config.apiUrl,
  mcpUrl: env("NEXT_PUBLIC_MCP_URL") ?? config.mcpUrl,
  apiKeyLive: `${config.apiKeyPrefix}_live_`,
  apiKeyFamily: `${config.apiKeyPrefix}_`,
  /** Crawler identity in robots.txt and the User-Agent header. */
  userAgent: `${config.name}Bot`,
  /** MCP tools are namespaced by slug: `pluck_scrape`, `pluck_search`, … */
  tool: (name: string) => `${config.slug}_${name}`,
  /** Headers: `pluck-signature`, `x-pluck-internal`. */
  header: (name: string) => `${config.slug}-${name}`,
} as const;
