import { endpoints } from "@pluck/shared";
import Link from "next/link";
import { CodeBlock, CodeTabs } from "@/components/code-tabs";
import { HeroDemo } from "@/components/hero-demo";
import { HeroField } from "@/components/hero-field";
import { SITE } from "@/lib/site";

const menuRows = [
  { ...endpoints.scrape, price: "1", note: "markdown, HTML, links, images, screenshots" },
  {
    ...endpoints.crawlStart,
    price: "1/page",
    note: "a whole site, depth and path rules, webhook when done",
  },
  { ...endpoints.search, price: "2", note: "web, news or images, with the pages already read" },
  { ...endpoints.extract, price: "9", note: "your JSON schema, filled from the page" },
  { ...endpoints.brand, price: "10", note: "logos, colors, fonts, socials, industry codes" },
  { ...endpoints.monitorCreate, price: "1/check", note: "tell me when this page changes" },
];

const samples = [
  {
    label: "TypeScript",
    language: "ts",
    code: `import { Pluck } from "@pluckai/sdk";

const pluck = new Pluck({ apiKey: process.env.PLUCK_API_KEY });

const page = await pluck.scrape({
  url: "https://arxiv.org/abs/1706.03762",
  formats: ["markdown"],
});

console.log(page.markdown);        // ready for your prompt
console.log(page.$meta.creditsUsed); // 1`,
  },
  {
    label: "Python",
    language: "python",
    code: `from ${SITE.pythonPackage} import Pluck

pluck = Pluck()  # reads PLUCK_API_KEY

page = pluck.scrape(
    "https://arxiv.org/abs/1706.03762",
    formats=["markdown"],
)

print(page.markdown)                # ready for your prompt
print(page.meta.credits_used)       # 1`,
  },
  {
    label: "cURL",
    language: "bash",
    code: `curl -X POST ${SITE.apiUrl}/v1/scrape \\
  -H "Authorization: Bearer $PLUCK_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"url":"https://arxiv.org/abs/1706.03762","formats":["markdown"]}'`,
  },
  {
    label: "MCP",
    language: "json",
    code: `{
  "mcpServers": {
    "pluck": {
      "url": "${SITE.mcpUrl}/mcp",
      "headers": { "Authorization": "Bearer $PLUCK_API_KEY" }
    }
  }
}`,
  },
];

const extractSample = [
  {
    label: "Request",
    language: "json",
    code: `POST /v1/extract
{
  "url": "https://www.apple.com/shop/buy-mac/macbook-air",
  "schema": {
    "type": "object",
    "properties": {
      "models": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "name":  { "type": "string" },
            "price": { "type": "number" },
            "chip":  { "type": "string" }
          }
        }
      }
    }
  }
}`,
  },
  {
    label: "Response",
    language: "json",
    code: `{
  "data": {
    "models": [
      { "name": "MacBook Air 13\\"", "price": 999,  "chip": "M4" },
      { "name": "MacBook Air 15\\"", "price": 1199, "chip": "M4" }
    ]
  },
  "meta": { "creditsUsed": 9, "cached": false, "durationMs": 4120 }
}`,
  },
];

export default function HomePage() {
  return (
    <>
      <div className="relative isolate overflow-hidden">
        <HeroField />
        <section className="mx-auto max-w-6xl px-4 pb-16 pt-14 sm:px-6 sm:pt-20">
          <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
            <div>
              <h1 className="text-4xl sm:text-[3.3rem]">Give your model the page, not the HTML.</h1>
              <p className="prose-pluck mt-6 text-lg text-[var(--ink-soft)]">
                Pluck reads any URL the way a person would: running the JavaScript, skipping the
                cookie banner, keeping the tables. It hands back markdown, JSON, links or a
                screenshot. One call, one credit.
              </p>
              {/* Side by side once there is room; stacked and full width on a
                phone, where a half-width button is a small target. */}
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                <Link
                  href="/dashboard"
                  className="bg-[var(--ink)] px-5 py-3 text-center text-[var(--paper)] transition-opacity hover:opacity-85 sm:py-2.5"
                >
                  Start with 1,000 free credits
                </Link>
                <Link
                  href={SITE.repo}
                  className="btn-outline px-5 py-3 text-center sm:py-2.5"
                  target="_blank"
                  rel="noreferrer"
                >
                  Read the source
                </Link>
              </div>
              <p className="mt-5 text-sm text-[var(--ink-faint)]">
                No subscription. Credits do not expire. Every endpoint works the same on your own
                server.
              </p>
            </div>
            <HeroDemo />
          </div>
        </section>
      </div>

      <section className="border-y border-[var(--line)] bg-[var(--sheet)]">
        <div className="mx-auto grid max-w-6xl gap-x-12 gap-y-10 px-4 py-14 sm:px-6 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <h2 className="text-2xl">What you can pull</h2>
            <p className="mt-3 text-sm text-[var(--ink-soft)]">
              Nine endpoints, priced in credits. A credit is a tenth of a cent, and you only pay for
              what a call actually did.
            </p>
          </div>
          <ul className="space-y-4">
            {menuRows.map((row) => (
              <li key={row.id}>
                <div className="leaders">
                  <span className="mono text-sm text-[var(--ink)]">
                    {row.method.toUpperCase()} {row.path}
                  </span>
                  <span className="mono shrink-0 text-sm text-[var(--accent)]">
                    {row.price} <span className="text-[var(--ink-faint)]">cr</span>
                  </span>
                </div>
                <p className="mt-1 text-sm text-[var(--ink-soft)]">{row.note}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr]">
          <div>
            <h2 className="text-2xl">Four lines, any language</h2>
            <p className="mt-3 text-sm text-[var(--ink-soft)]">
              REST with an OpenAPI spec, typed SDKs, and an MCP server so agents can call it
              directly. The same key works everywhere.
            </p>
            <Link
              href="/docs"
              className="mt-5 inline-block text-sm text-[var(--accent)] underline underline-offset-4"
            >
              Read the docs
            </Link>
          </div>
          <CodeTabs samples={samples} />
        </div>
      </section>

      <section className="border-y border-[var(--line)] bg-[var(--sheet)]">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.15fr_0.85fr]">
          <CodeTabs samples={extractSample} />
          <div>
            <h2 className="text-2xl">Describe the shape. Get the data.</h2>
            <p className="mt-3 text-sm text-[var(--ink-soft)]">
              Send a JSON schema and Pluck fills it from the page, validating before it answers.
              Product pages skip the model entirely when the site publishes structured data: same
              result, a fraction of the cost.
            </p>
            <p className="mt-4 text-sm text-[var(--ink-soft)]">
              Use our model, or send <code className="mono text-[var(--ink)]">x-llm-key</code> and
              pay your provider directly. OpenRouter, OpenAI, Anthropic, Gemini, Groq, or anything
              OpenAI-compatible including Ollama on your own box.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-3">
          <div>
            <h2 className="text-2xl">Runs on your machine too</h2>
            <p className="mt-3 text-sm text-[var(--ink-soft)]">
              The hosted service is this repository with a credit meter switched on. Self-hosting
              gives you every endpoint, no billing, no account, and your scraped pages never leave
              your network.
            </p>
            <Link
              href="/docs/self-hosting"
              className="mt-4 inline-block text-sm text-[var(--accent)] underline underline-offset-4"
            >
              Self-hosting guide
            </Link>
          </div>
          <div className="lg:col-span-2">
            <CodeBlock
              language="bash"
              code={`git clone ${SITE.repo.replace("https://", "")}
cd pluck && cp .env.example .env
docker compose up -d

curl localhost:8080/v1/scrape \\
  -H "Authorization: Bearer $BOOTSTRAP_API_KEY" \\
  -d '{"url":"https://example.com"}'`}
            />
          </div>
        </div>
      </section>

      <section className="border-t border-[var(--line)]">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-16 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-3xl">Pluck a page. See for yourself.</h2>
            <p className="mt-2 text-sm text-[var(--ink-soft)]">
              1,000 credits when you sign in with GitHub. No card.
            </p>
          </div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Link
              href="/dashboard"
              className="bg-[var(--accent)] px-5 py-3 text-center text-white transition-opacity hover:opacity-90 sm:py-2.5"
            >
              Get an API key
            </Link>
            <Link href="/enterprise" className="btn-outline px-5 py-3 text-center sm:py-2.5">
              Talk to us about volume
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
