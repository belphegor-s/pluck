# Self-hosting

The hosted service and the open-source project are the same code. Self-hosting gives you every endpoint with no billing, no accounts and no pages leaving your network.

## Docker Compose

```bash
git clone https://github.com/belphegor-s/pluck
cd pluck
cp .env.example .env
# set PLUCK_ENCRYPTION_KEY (32+ chars) and BOOTSTRAP_API_KEY
docker compose up -d
```

That brings up Postgres, two Redis instances (one for queues, one for cache), SearXNG for search, SeaweedFS (S3-compatible) for screenshots, the API, a browser worker, the MCP server and the dashboard.

```bash
curl -X POST http://localhost:8080/v1/scrape \
  -H "Authorization: Bearer $BOOTSTRAP_API_KEY" \
  -d '{"url":"https://example.com"}'
```

API docs are at `http://localhost:8080/docs`, the dashboard at `http://localhost:3000`, MCP at `http://localhost:8081/mcp`.

## Configuration

| Variable | Purpose |
| --- | --- |
| `PLUCK_ENCRYPTION_KEY` | Required. Encrypts stored provider keys. 32+ characters. |
| `BOOTSTRAP_API_KEY` | A key that works immediately, without signing in. |
| `DATABASE_URL`, `REDIS_URL`, `CACHE_REDIS_URL` | Storage. The cache Redis should use `allkeys-lru`; the queue Redis must use `noeviction`. |
| `PLUCK_LLM_PROVIDER`, `PLUCK_LLM_API_KEY`, `PLUCK_LLM_MODEL` | Instance-wide model for extraction. Without it, AI endpoints ask callers to bring a key. |
| `BROWSER_CONCURRENCY` | Pages rendered at once per worker. Budget ~400 MB each. |
| `PROXY_DATACENTER_URLS`, `PROXY_RESIDENTIAL_URLS` | Comma-separated proxy URLs. `{country}` and `{session}` placeholders are substituted. |
| `SEARXNG_URL`, `BRAVE_API_KEY`, `SERPER_API_KEY` | Search backends, tried in `SEARCH_PROVIDERS` order. |
| `S3_*`, `STORAGE_PUBLIC_URL` | Where screenshots and logos are stored. Without it, screenshots come back as data URIs. |
| `ALLOW_PRIVATE_NETWORK` | Off by default. Turn on only to scrape hosts inside your own network. |
| `RATE_LIMIT_PER_MINUTE` | `0` disables rate limiting. |
| `BILLING_ENABLED` | Leave `false`. Credits are a hosted-service concept. |

## Scaling

The API is stateless — run as many as you like behind a load balancer. Browser work is queued in Redis, so add worker containers to increase throughput; set `WORKER_ROLES` to split render, crawl, monitor and webhook duties onto different machines. Postgres holds jobs, usage and monitors.

## Renaming it

Product naming lives in one file: `packages/shared/src/identity.ts`. Change the name, slug and URLs there, rebuild, and the site, docs, API key prefix, webhook headers, crawler user agent and MCP tool names all follow.
