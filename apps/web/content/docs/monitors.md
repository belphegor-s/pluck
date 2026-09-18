# Monitors

A monitor re-reads something on a schedule and tells you when the answer changes.

```bash
curl -X POST https://pluck-api.procd.cc/v1/monitors \
  -H "Authorization: Bearer $PLUCK_API_KEY" \
  -d '{
    "name": "Competitor pricing",
    "type": "page",
    "url": "https://competitor.example.com/pricing",
    "selector": ".pricing-table",
    "intervalMinutes": 1440,
    "webhook": "https://you.example.com/hooks/pluck"
  }'
```

## Types

- `page` — watches the page's markdown. Add `selector` to watch one part of it.
- `sitemap` — watches the site's URL list, and reports added and removed URLs.
- `extract` — runs an extraction and watches the JSON, so wording changes are ignored but values are not.

The first check records a baseline and reports nothing. After that, every change is stored with a unified diff and delivered to your webhook.

## Webhooks

Deliveries are signed. Verify before trusting:

```ts
import { verifyWebhook } from "@pluck/sdk";

const raw = await request.text();
const ok = await verifyWebhook(raw, request.headers.get("pluck-signature"), process.env.PLUCK_WEBHOOK_SECRET!);
```

The signature header is `t=<unix seconds>,v1=<hmac sha256 of "t.body">`, using your account's webhook secret. Deliveries retry with exponential backoff for about a day; reply with any 2xx to acknowledge.

## Costs and limits

Each check costs 1 credit plus the underlying scrape or extraction. If the balance runs out the monitor pauses rather than failing silently, and ten consecutive errors also pause it. Hosted accounts check at most every 15 minutes; self-hosted instances go down to every five.
