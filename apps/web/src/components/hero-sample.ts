/**
 * What the hero shows before anyone has plucked anything: a real run of the
 * demo against this project's own GitHub page, captured on 11 October 2026.
 * `markdown` is the start of what came back; the two sizes are for the
 * whole page, HTML in and markdown out.
 *
 * To refresh it, pluck the page from the hero and copy the numbers.
 */
export const HERO_SAMPLE = {
  url: "https://github.com/belphegor-s/pluck",
  htmlBytes: 336115,
  markdown:
    '# Pluck\n\n**The web, ready for your model.** Pluck turns any URL into clean markdown, structured JSON, screenshots or brand data: the things you actually want to put in a prompt, instead of raw HTML.\n\nIt is the whole product, open source: the same code runs the hosted service at [pluck.procd.cc](https://pluck.procd.cc/). Self-host it and you get every endpoint, no billing, no accounts, and nothing you scrape leaving your network.\n\n```\ncurl -X POST https://pluck-api.procd.cc/v1/scrape \\\n  -H "Authorization: Bearer $PLUCK_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"url":"https://example.com","formats":["markdown"]}\'\n```\n',
  markdownBytes: 5944,
  links: [
    "https://github.com/",
    "https://github.com/login?return_to=https%3A%2F%2Fgithub.com%2Fbelphegor-s%2Fpluck",
    "https://github.com/features/copilot",
    "https://github.com/features/ai/github-app",
    "https://github.com/mcp",
    "https://github.com/features/actions",
    "https://github.com/features/codespaces",
    "https://github.com/features/issues",
    "https://github.com/features/code-review",
    "https://github.com/features/code-quality",
    "https://github.com/security/advanced-security",
    "https://github.com/security/advanced-security/code-security",
  ],
  metadata: {
    title:
      "GitHub - belphegor-s/pluck: The web, ready for your model. Open-source scraping, crawling, search, extraction and monitoring API for AI.",
    description:
      "The web, ready for your model. Open-source scraping, crawling, search, extraction and monitoring API for AI. - belphegor-s/pluck",
    language: "en",
    siteName: "GitHub",
  },
  renderedWith: "http",
  durationMs: 1299,
};
