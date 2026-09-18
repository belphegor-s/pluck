# Quickstart

Pluck turns a URL into something a model can actually read. This page gets you from zero to your first response.

## 1. Get a key

Sign in with GitHub and open [API keys](/dashboard/keys). New accounts start with 1,000 credits, which is 1,000 plain scrapes. Keys look like `pk_live_…` and are shown once.

```bash
export PLUCK_API_KEY=pk_live_your_key
```

## 2. Scrape a page

```bash
curl -X POST https://pluck-api.procd.cc/v1/scrape \
  -H "Authorization: Bearer $PLUCK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","formats":["markdown"]}'
```

```json
{
  "data": {
    "markdown": "# Example Domain\n\nThis domain is for use in…",
    "metadata": { "title": "Example Domain", "statusCode": 200 },
    "renderedWith": "http",
    "proxyUsed": "none",
    "warnings": []
  },
  "meta": { "requestId": "…", "creditsUsed": 1, "cached": false, "durationMs": 412 }
}
```

Every response has the same shape: `data` for the result, `meta` for what it cost and how long it took.

## 3. Use it from your language

```ts
import { Pluck } from "@pluckai/sdk";

const pluck = new Pluck();                       // reads PLUCK_API_KEY
const page = await pluck.scrape({ url: "https://example.com" });
console.log(page.markdown, page.$meta.creditsUsed);
```

## What to read next

- [Scraping](/docs/scraping) — formats, JavaScript rendering, proxies and caching
- [Crawling](/docs/crawling) — whole sites, with path rules and webhooks
- [Extraction](/docs/extraction) — JSON that matches your schema
- [Brand data](/docs/brand) — logos, colors, fonts, industry codes
- [Monitors](/docs/monitors) — get told when a page changes
- [MCP server](/docs/mcp) — give an agent these tools directly
- [Self-hosting](/docs/self-hosting) — run the whole thing yourself
