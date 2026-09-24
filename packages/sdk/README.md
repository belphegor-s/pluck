# @pluckai/sdk

TypeScript client for [Pluck](https://pluck.procd.cc): the web, as LLM-ready context. Scrape a page to markdown, crawl a site, search, pull structured JSON out of a page, or watch a URL for changes.

```bash
npm install @pluckai/sdk
```

## Use it

```ts
import { Pluck } from "@pluckai/sdk";

const pluck = new Pluck({ apiKey: process.env.PLUCK_API_KEY });

const page = await pluck.scrape({
  url: "https://arxiv.org/abs/1706.03762",
  formats: ["markdown"],
});

console.log(page.markdown); // ready for your prompt
console.log(page.$meta.creditsUsed); // 1
```

Get a key at [pluck.procd.cc](https://pluck.procd.cc). New workspaces start with 1,000 free credits, and credits do not expire.

## Extract structured data

Describe the shape you want and Pluck fills it from the page, validating before it answers.

```ts
const { models } = await pluck.extract({
  url: "https://www.apple.com/shop/buy-mac/macbook-air",
  schema: {
    type: "object",
    properties: {
      models: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            price: { type: "number" },
          },
        },
      },
    },
  },
});
```

Bring your own model key with `x-llm-key` and AI calls cost a fraction as much: you pay your provider directly.

## Other endpoints

| Call | What it does |
| --- | --- |
| `pluck.scrape()` | One page as markdown, HTML, links, images or a screenshot |
| `pluck.crawl()` | A whole site, with depth and path rules, and a webhook when it finishes |
| `pluck.search()` | Web, news or image search, optionally with each result already read |
| `pluck.map()` | Every URL on a site |
| `pluck.parse()` | PDF, DOCX and friends into markdown |
| `pluck.brand()` | Logos, colours, fonts and socials for a domain |
| `pluck.monitors.create()` | Tell me when this page changes |

Full reference: [pluck.procd.cc/docs](https://pluck.procd.cc/docs).

## Self-hosting

Pluck is open source (AGPL-3.0) and runs anywhere Docker does, with every endpoint and no billing. Point the client at your own instance:

```ts
const pluck = new Pluck({ baseUrl: "http://localhost:8080", apiKey: process.env.PLUCK_API_KEY });
```

See the [self-hosting guide](https://pluck.procd.cc/docs/self-hosting).

## License

MIT.
