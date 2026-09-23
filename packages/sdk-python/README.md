# pluckai

Python client for [Pluck](https://pluck.procd.cc), the open-source web context API for LLMs: scrape, crawl, search, extract and monitor the web as clean, model-ready data.

```bash
pip install pluckai
```

Python 3.9+. One dependency, [httpx](https://www.python-httpx.org/).

## Quick start

```python
from pluckai import Pluck

pluck = Pluck()  # reads PLUCK_API_KEY

page = pluck.scrape("https://arxiv.org/abs/1706.03762", formats=["markdown"])

print(page.markdown)  # ready for your prompt
print(page.meta.credits_used)  # 1
```

Get a key at [pluck.procd.cc/dashboard/keys](https://pluck.procd.cc/dashboard/keys). Self-hosting? Point the client at your instance with `base_url="http://localhost:8080"` or `PLUCK_API_URL`.

## Responses

Every call returns the endpoint's `data` as a `dict` that also reads as attributes. Fields accept the API's camelCase name or snake_case, and `.meta` holds the call's `request_id`, `credits_used`, `cached` and `duration_ms`.

```python
page = pluck.scrape("https://example.com", only_main_content=True)
page.rendered_with == page["renderedWith"]  # True
json.dumps(page)  # plain JSON, no conversion needed
```

Top-level keyword arguments are converted to camelCase (`only_main_content` → `onlyMainContent`). Nested objects, such as `scrape_options`, `schema` or `headers`, are sent exactly as you pass them, so use the API's field names inside them.

## Endpoints

```python
pluck.scrape(url, formats=["markdown", "links"], render="auto")
pluck.parse(url="https://example.com/report.pdf")  # or file="report.pdf" / file=b"..."
pluck.map(url, limit=500)
pluck.screenshot(url, full_page=True)
pluck.search("vector databases", limit=5, scrape={"formats": ["markdown"]})

pluck.extract(url, prompt="Each plan's name and monthly price")
pluck.extract(url, schema={"type": "object", "properties": {"price": {"type": "number"}}})
pluck.product(url)
pluck.products(url, limit=50)
pluck.styleguide(url)

pluck.brand("stripe.com")
pluck.classify(domain="stripe.com")
pluck.transaction("SQ *BLUE BOTTLE COFFEE")
pluck.logo_url("stripe.com", size=64)  # no request, no credits

pluck.usage(days=30)
```

### Crawls

```python
job = pluck.crawl.start("https://docs.example.com", limit=100, max_depth=3)
status = pluck.crawl.get(job.id)
pluck.crawl.cancel(job.id)

# Or start, wait and collect every page in one call:
result = pluck.crawl.run("https://docs.example.com", limit=100, max_wait=600)
for page in result.pages:
    print(page.url, len(page.markdown or ""))
```

### Monitors

```python
monitor = pluck.monitors.create(
    "https://competitor.example/pricing",
    type="page",
    interval_minutes=1440,
    selector="#pricing",
    webhook="https://you.example.com/hooks/pluck",
)
pluck.monitors.list(limit=50)
pluck.monitors.changes(monitor.id)
pluck.monitors.update(monitor.id, active=False)
pluck.monitors.update(monitor.id, webhook=None)  # None removes a field
pluck.monitors.delete(monitor.id)
```

### Webhooks

```python
pluck.webhooks.test("https://you.example.com/hooks/pluck")
pluck.webhooks.deliveries(limit=20)
pluck.webhooks.redeliver("whd_...")
```

Verify what you receive with your signing secret from the dashboard. Pass the raw body, not parsed JSON:

```python
from pluckai import construct_event, WebhookVerificationError


@app.post("/hooks/pluck")
async def hook(request: Request):
    body = await request.body()
    try:
        event = construct_event(body, request.headers.get("pluck-signature"), SECRET)
    except WebhookVerificationError:
        return Response(status_code=400)
    if event.event == "monitor.changed":
        ...
    return Response(status_code=204)
```

Deliveries can repeat after a retry or a redelivery, so deduplicate on `event.id`.

## Async

```python
from pluckai import AsyncPluck

async with AsyncPluck() as pluck:
    page = await pluck.scrape("https://example.com")
    result = await pluck.crawl.run("https://docs.example.com", limit=20)
```

## Bring your own model

AI endpoints (`extract`, `product`, `classify`, ...) can run on your own provider key. It is sent per request and never stored.

```python
pluck = Pluck(llm={"provider": "openai", "api_key": "sk-...", "model": "gpt-5-mini"})
```

## Errors

Every error subclasses `pluckai.PluckError`. API errors carry `status`, `code`, `message` and `request_id`:

| Exception | When |
|---|---|
| `AuthenticationError` | 401, bad or revoked key |
| `InsufficientCreditsError` | 402, out of credits |
| `PermissionDeniedError` | 403, private address or robots.txt |
| `NotFoundError` | 404 |
| `TargetError` | 424, the page itself was unreachable, blocked or too slow |
| `RateLimitError` | 429, after retries |
| `InternalServerError` | 5xx, after retries |
| `APIConnectionError`, `APITimeoutError` | the API could not be reached |

Rate limits, 502/503/504 and connection failures are retried twice with backoff, honouring `Retry-After`. A 500 on a write is not retried, because the call may already have run. Tune with `max_retries=` and `timeout=` (seconds, default 180).

## Licence

MIT. The Pluck server is AGPL-3.0; see the [repository](https://github.com/belphegor-s/pluck).
