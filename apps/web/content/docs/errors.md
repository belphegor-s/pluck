# Errors, limits and reliability

## Error shape

```json
{
  "error": {
    "code": "target_blocked",
    "message": "Blocked by the target site (HTTP 403).",
    "requestId": "8f0e…"
  }
}
```

| Code | HTTP | What to do |
| --- | --- | --- |
| `bad_request` | 400 | Fix the request. `details` lists the failing fields. |
| `invalid_api_key` | 401 | Check the key, or that it has not been revoked. |
| `insufficient_credits` | 402 | Top up. `details.required` says how many the call needs. |
| `forbidden` | 403 | Private addresses and credentialed URLs are refused. |
| `blocked_by_robots` | 403 | robots.txt disallows it; set `respectRobots: false` if you may. |
| `not_found` | 404 | No such crawl, monitor or brand. |
| `unsupported_content` | 415 | That file type cannot be parsed. |
| `rate_limited` | 429 | Back off; `x-ratelimit-reset` says when the window turns over. |
| `target_blocked` / `target_unreachable` | 424 | The site refused or failed. Try `proxy: "residential"`. |
| `target_timeout` | 424 | Raise `timeout`, or narrow the page with `includeTags`. |
| `llm_not_configured` | 400 | No model is configured. Add a provider key, or send `x-llm-key`. |
| `llm_failed` | 424 | The model provider refused, ran out of credit, or timed out. The message says which. |

Anything caused by a third party (the page you asked for, or the model provider) answers **424 Failed Dependency** rather than a gateway status, so the `code` and `message` survive any CDN sitting in front of the API.

Every response carries `x-request-id`. Include it when you ask us about a call.

## Retries

The SDKs retry timeouts, 429s and 5xx responses twice with exponential backoff and jitter. Scrapes are idempotent, so retrying is safe. Crawls are not: reuse the crawl id rather than starting a second one.

## Rate limits

Hosted accounts get 300 requests per minute by default; ask if you need more. Headers `x-ratelimit-limit`, `x-ratelimit-remaining` and `x-ratelimit-reset` come back on every call.

## Data retention

Crawl results are kept 7 days, monitor history 90 days, usage records 400 days. Scraped pages in the cache expire within hours. Nothing scraped is used to train anything.
