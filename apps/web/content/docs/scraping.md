# Scraping

`POST /v1/scrape` is the endpoint most people use. It fetches a page over plain HTTP, decides whether the page needs a browser, and returns only the parts you asked for.

## Formats

Ask for one or many. Each is a key on the response.

| Format | What you get |
| --- | --- |
| `markdown` | Clean article-style markdown, links and tables preserved |
| `html` | The cleaned HTML markdown was made from |
| `rawHtml` | The page exactly as received, after JavaScript |
| `text` | Plain text with structure flattened |
| `links` | Every absolute link on the page |
| `images` | Image URLs with alt text and dimensions |
| `metadata` | Title, description, canonical, Open Graph, favicon (always included) |
| `screenshot` | PNG, JPEG or WebP, viewport or full page |
| `json` | Structured data matching your schema — see [Extraction](/docs/extraction) |

## JavaScript rendering

`render` is `auto` by default: Pluck fetches over HTTP first and only starts a browser when the page turns out to be an empty shell, an interstitial or a client-side redirect. That keeps the common case around 300–800 ms and 1 credit.

- `render: "always"` — always use the browser (+2 credits)
- `render: "never"` — never use the browser; fails rather than rendering

## Getting the part you want

- `onlyMainContent` (default `true`) drops nav, footers, cookie banners and ad blocks.
- `includeTags: [".article-body"]` keeps only what matches those CSS selectors.
- `excludeTags: [".comments", "aside"]` removes matches before conversion.

## Waiting and interacting

```json
{
  "url": "https://app.example.com/reports",
  "waitFor": 1500,
  "actions": [
    { "type": "waitForSelector", "selector": "table.results" },
    { "type": "click", "selector": "button#load-more" },
    { "type": "scroll", "direction": "down" }
  ]
}
```

Actions imply a browser render.

## Blocked pages and proxies

`proxy` defaults to `auto`: go direct, and only if the site answers with a challenge or a 403/429 retry through a datacenter proxy and then a residential one. You pay for what was used, so most pages cost nothing extra. Force a route with `"proxy": "residential"` (+5 credits) or turn it off with `"none"`.

### Your own proxies

Add proxies under [Dashboard → Proxies](/dashboard/proxies) and every request on your account goes out through them — scrapes, crawls, monitors and browser renders alike. Paste the gateway URL your provider gave you:

```
http://user:pass@gateway.provider.io:7777
socks5://user-country-{country}-session-{session}:pass@pool.example.net:1080
```

`{country}` and `{session}` are substituted per request, which is how most providers do geo-targeting and sticky sessions. `http`, `https` and `socks5` all work.

A tier you have not configured falls back to ours, so adding one residential proxy keeps our datacenter pool for the cheaper hops. URLs are encrypted before storage and never shown again — only the gateway host stays visible — and a proxy that fails five checks in a row leaves the rotation until you re-enable it. **Test** on each row makes a real connection and reports the exit IP, which is the quickest way to find an expired password or an allowlist that is missing this server's address.

Proxies on private or loopback addresses are refused: the server makes these connections on your behalf, so they would be a way into networks you should not reach.

Self-hosting sets them for the whole instance instead, with `PROXY_DATACENTER_URLS` and `PROXY_RESIDENTIAL_URLS`. An instance with no proxy URLs and no account proxies simply always goes direct.

## Caching

`maxAge` (seconds, default 3600) serves a recent copy if one exists — those responses cost 1 credit and return in milliseconds, with `meta.cached: true`. Set `maxAge: 0` for a guaranteed fresh fetch. Requests with custom `headers` or `actions` are never served from, or written to, the shared cache.

## robots.txt

Pluck identifies itself as `PluckBot` and respects robots.txt by default. Set `respectRobots: false` for sites you own or have permission to read; the choice, and the responsibility, is yours.

## Documents

`POST /v1/parse` converts PDF, DOCX, HTML, CSV, JSON and text into markdown, from a URL or from base64 bytes. Scraping a URL that turns out to be a PDF does this automatically.
