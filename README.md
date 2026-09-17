# Pluck

**The web, ready for your model.** Pluck turns any URL into clean markdown, structured JSON, screenshots or brand data — the things you actually want to put in a prompt, instead of raw HTML.

It is the whole product, open source: the same code runs the hosted service at [pluck.procd.cc](https://pluck.procd.cc). Self-host it and you get every endpoint, no billing, no accounts, and nothing you scrape leaving your network.

```bash
curl -X POST https://pluck-api.procd.cc/v1/scrape \
  -H "Authorization: Bearer $PLUCK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","formats":["markdown"]}'
```

## What it does

| | |
| --- | --- |
| **Scrape** | Any page as markdown, HTML, text, links, images, metadata or a screenshot. JavaScript is rendered only when the page needs it. |
| **Parse** | PDF, DOCX, HTML, CSV and JSON into markdown. |
| **Map** | Every URL on a site in about a second, from sitemaps and links. |
| **Crawl** | A whole site or section, with depth and glob path rules, resumable, webhook on completion. |
| **Search** | Web, news or image results — optionally with every result already scraped. |
| **Extract** | JSON that matches your schema, validated before it is returned. Products come from the site's own structured data when it has any. |
| **Styleguide** | Real design tokens from a rendered page: palette, fonts, type scale, radii, shadows, component styles. |
| **Brand** | Domain, work email, company name or ticker into logos, colors, socials, address and NAICS/SIC codes. Free logo CDN. |
| **Monitor** | Watch a page, a sitemap or an extraction and get a signed webhook when it changes. |
| **MCP** | All of the above as tools for an agent, over HTTP or stdio. |

## Run it yourself

```bash
git clone https://github.com/belphegor-s/pluck
cd pluck
cp .env.example .env          # set PLUCK_ENCRYPTION_KEY and BOOTSTRAP_API_KEY
docker compose up -d
```

That starts Postgres, two Redis instances, SearXNG, MinIO, the API, a browser worker, the MCP server and the dashboard.

```bash
curl -X POST http://localhost:8080/v1/scrape \
  -H "Authorization: Bearer $BOOTSTRAP_API_KEY" \
  -d '{"url":"https://example.com"}'
```

- API and reference docs: `http://localhost:8080/docs`
- Dashboard: `http://localhost:3000`
- MCP endpoint: `http://localhost:8081/mcp`

Full guide: [docs/self-hosting](https://pluck.procd.cc/docs/self-hosting).

## Bring your own model

Extraction, product parsing and classification need a language model. Point Pluck at whichever one you already pay for — OpenRouter, OpenAI, Anthropic, Gemini, Groq, or anything OpenAI-compatible including Ollama and vLLM — per instance, per account, or per request:

```bash
-H "x-llm-provider: anthropic" -H "x-llm-key: sk-ant-…" -H "x-llm-model: claude-haiku-4-5"
```

Stored keys are encrypted with AES-256-GCM and are never returned by the API. On the hosted service, using your own key costs 1 credit per AI call instead of 8.

## Development

Requires Node 24+ and pnpm 11.

```bash
pnpm install
pnpm build
pnpm --filter @pluck/core test

# a local stack without Docker needs Postgres and Redis reachable, then:
pnpm --filter @pluck/db migrate
pnpm dev
```

### Layout

```
apps/api        REST API (Hono): auth, credits, caching, OpenAPI
apps/worker     Playwright browser fleet, crawler, monitors, webhooks
apps/web        Next.js site: landing, docs, playground, dashboard
apps/mcp        MCP server (streamable HTTP + stdio)
packages/shared Endpoint registry, schemas, pricing, product naming
packages/core   Scrape engine: SSRF-safe fetch, proxies, HTML → markdown, parsing
packages/ai     Provider-agnostic LLM layer
packages/db     Drizzle schema and migrations
packages/runtime Config, Redis, storage, queues, credits
packages/sdk    TypeScript client
```

The endpoint registry in `packages/shared/src/endpoints.ts` is the single source of truth: routes, validation, the OpenAPI document, MCP tools and SDK types all derive from it.

**Renaming the project** is one file: `packages/shared/src/identity.ts` holds the name, slug, URLs and API key prefix. Change it, rebuild, and the site, docs, keys, webhook headers, crawler user agent and MCP tool names all follow.

## Security

- Every outbound request is checked against private, loopback and link-local ranges at connect time, including each redirect hop and every subresource a rendered page requests.
- API keys are stored as SHA-256 hashes; provider keys as AES-256-GCM ciphertext.
- Sign-in requires a verified primary email and identifies users by GitHub account id, never by email address, so an unverified address cannot claim an existing account.
- Dependencies install with a three-day release cooldown, build scripts denied by default, and a trust-downgrade check.

Found a vulnerability? Please email rather than opening a public issue: hello@pluck.procd.cc.

## License

[AGPL-3.0](LICENSE). Run it, change it, host it for your own users — if you offer a modified version as a service, publish your changes.
