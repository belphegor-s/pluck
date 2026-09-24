# Brand data

`GET /v1/brand` turns an identifier into a company profile.

```bash
curl "https://pluck-api.procd.cc/v1/brand?domain=stripe.com" \
  -H "Authorization: Bearer $PLUCK_API_KEY"
```

Look a company up by exactly one of:

- `domain`: `stripe.com`
- `email`: a work address; personal providers are rejected
- `name`: resolved through web search to the official site
- `ticker`: a stock symbol

You get back the name, description, slogan, logos (favicons, apple-touch icons, manifest icons and the header logo), brand colors ranked by prominence, fonts, social profiles, postal address, contact email and phone where published, and NAICS/SIC industry codes.

Profiles are cached and shared across accounts, so the second lookup of a popular domain costs 2 credits instead of 10. `maxAge` controls how stale a cached profile may be.

## Logos

```html
<img src="https://pluck-api.procd.cc/v1/logo/stripe.com?size=128" alt="Stripe" />
```

No API key, no credits. Square icons are preferred, output is WebP or PNG at the size you ask for, and unknown domains fall back to a colored monogram (`fallback=404` to get a 404 instead). Responses are cached at the edge for a week.

## Industry codes

`POST /v1/brand/classify` returns NAICS 2022 and SIC codes with confidence scores, from a domain or from a description you already have.

## Transactions

`POST /v1/brand/transaction` maps a card or bank descriptor to the merchant behind it.

```json
{ "descriptor": "SQ *BLUE BOTTLE COFFE OAKLAND CA" }
```

```json
{
  "merchant": "Blue Bottle Coffee",
  "domain": "bluebottlecoffee.com",
  "processor": "Square",
  "location": "Oakland, CA",
  "confidence": 0.91,
  "brand": { "…": "full brand profile when confidence is high" }
}
```
