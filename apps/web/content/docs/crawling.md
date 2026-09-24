# Crawling

`POST /v1/crawl` walks a site breadth-first and scrapes every page that matches your rules. It returns a job id immediately.

```bash
curl -X POST https://pluck-api.procd.cc/v1/crawl \
  -H "Authorization: Bearer $PLUCK_API_KEY" \
  -d '{
    "url": "https://docs.example.com",
    "limit": 200,
    "maxDepth": 3,
    "includePaths": ["/guides/**"],
    "excludePaths": ["/guides/legacy/**"],
    "webhook": { "url": "https://you.example.com/hooks/pluck" }
  }'
```

Then poll, or wait for the webhook:

```bash
curl "https://pluck-api.procd.cc/v1/crawl/$CRAWL_ID?limit=50" \
  -H "Authorization: Bearer $PLUCK_API_KEY"
```

Each page comes back in the same shape as a scrape, plus the `depth` it was found at. Use `nextCursor` to page through results.

## Rules

- `limit`: hard cap on pages. Crawls stop there.
- `maxDepth`: link distance from the start URL.
- `includePaths` / `excludePaths`: glob patterns matched against the path, e.g. `/blog/**`.
- `allowSubdomains`: follow `docs.example.com` from `example.com`.
- `allowExternal`: follow links off the site entirely. Use with a small `limit`.
- `useSitemap`: seed the queue from sitemaps (on by default), which is usually faster and more complete than following links.
- `scrapeOptions`: any scrape option, applied to every page.

## Cost and control

Pages are charged as they complete, at normal scrape rates. If the account runs out of credits the crawl stops and reports `failed` with everything it had already collected. `DELETE /v1/crawl/{id}` cancels a running crawl and keeps the pages already scraped.

Crawl results are stored for 7 days.

## Mapping first

For large sites, `POST /v1/map` returns every URL Pluck can discover in about a second and costs 1 credit. Filter that list yourself, then scrape only what you need. That is usually much cheaper than crawling.
