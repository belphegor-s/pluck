import { CREDIT_USD, creditPacks, credits, endpoints } from "@pluck/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { CreditCalculator } from "@/components/credit-calculator";
import { formatNumber } from "@/lib/format";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Pricing",
  description: `${SITE.name} is pay as you go. Credits never expire, there is no subscription, and self-hosting is free.`,
  alternates: { canonical: "/pricing" },
};

const rows = [
  {
    label: "Scrape a page",
    credits: credits.scrape,
    detail: "markdown, HTML, links, images or metadata",
  },
  {
    label: "…that needs a browser",
    credits: credits.scrape + credits.browserRender,
    detail: "applied only when the page needs JavaScript",
  },
  {
    label: "…through a residential proxy",
    credits: credits.scrape + credits.residentialProxy,
    detail: "only when a site blocks everything else",
  },
  {
    label: "Screenshot",
    credits: credits.scrape + credits.browserRender + credits.screenshot,
    detail: "viewport or full page",
  },
  { label: "Parse a document", credits: credits.parse, detail: "+1 per 10 PDF pages" },
  { label: "Map a site", credits: credits.map, detail: "every URL, usually in about a second" },
  {
    label: "Search",
    credits: credits.search,
    detail: "plus scrape cost per result if you read them",
  },
  {
    label: "Extract JSON",
    credits: credits.scrape + credits.llm,
    detail: `${credits.scrape + credits.llmByok} with your own model key`,
  },
  {
    label: "Product data",
    credits: credits.extractProduct,
    detail: "no model needed when the site publishes structured data",
  },
  {
    label: "Styleguide",
    credits: credits.styleguide,
    detail: "colors, fonts, spacing from the rendered page",
  },
  { label: "Brand profile", credits: credits.brand, detail: "2 when it is already cached" },
  { label: "Logo", credits: 0, detail: "free, no key required" },
  {
    label: "Monitor check",
    credits: credits.monitorCheck,
    detail: "plus the scrape or extraction it performs",
  },
];

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <header className="max-w-[46ch]">
        <h1 className="text-4xl">Pay for pages, not seats</h1>
        <p className="mt-4 text-lg text-[var(--ink-soft)]">
          One credit is ${CREDIT_USD.toFixed(3)}. A plain scrape is one credit. Nothing renews,
          nothing expires, and running it yourself costs nothing at all.
        </p>
      </header>

      <section className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {creditPacks.map((pack) => (
          <div key={pack.id} className="sheet flex flex-col p-5">
            <p className="mono text-2xl">{formatNumber(pack.credits)}</p>
            <p className="text-sm text-[var(--ink-soft)]">credits</p>
            <p className="mono mt-4 text-lg">${pack.priceUsd}</p>
            {"bonus" in pack ? (
              <p className="mt-1 text-xs text-[var(--leaf)]">{pack.bonus}</p>
            ) : (
              <p className="mt-1 text-xs text-[var(--ink-faint)]">starter pack</p>
            )}
            <p className="mt-4 text-xs text-[var(--ink-faint)]">
              ≈ {formatNumber(pack.credits)} scrapes, or{" "}
              {formatNumber(Math.floor(pack.credits / (credits.scrape + credits.llm)))} AI
              extractions
            </p>
          </div>
        ))}
      </section>

      <section className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <Link
          href="/dashboard"
          className="bg-[var(--ink)] px-5 py-3 text-center text-[var(--paper)] sm:py-2.5"
        >
          Start with 1,000 free credits
        </Link>
        <Link
          href="/enterprise"
          className="border border-[var(--line)] px-5 py-3 text-center transition-colors hover:border-[var(--ink)] sm:py-2.5"
        >
          Volume and invoicing
        </Link>
      </section>

      <section className="mt-16 grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <h2 className="text-2xl">What each call costs</h2>
          <ul className="mt-5 space-y-3">
            {rows.map((row) => (
              <li key={row.label}>
                <div className="leaders">
                  <span className="text-sm">{row.label}</span>
                  <span className="mono shrink-0 text-sm text-[var(--accent)]">
                    {row.credits === 0 ? "free" : row.credits}
                  </span>
                </div>
                <p className="text-xs text-[var(--ink-faint)]">{row.detail}</p>
              </li>
            ))}
          </ul>
          <p className="mt-5 text-sm text-[var(--ink-soft)]">
            Cached responses cost 1 credit. Failed calls cost nothing: credits are refunded
            automatically.
          </p>
        </div>

        <div>
          <h2 className="text-2xl">Estimate your month</h2>
          <div className="mt-5">
            <CreditCalculator />
          </div>
        </div>
      </section>

      <section className="mt-16 grid gap-8 border-t border-[var(--line)] pt-10 md:grid-cols-3">
        <div>
          <h3 className="text-lg">Self-hosted</h3>
          <p className="mt-2 text-sm text-[var(--ink-soft)]">
            Free forever, AGPL-3.0, all {Object.keys(endpoints).length} endpoints. Your
            infrastructure, your bandwidth, your rules.
          </p>
          <Link
            href="/docs/self-hosting"
            className="mt-3 inline-block text-sm text-[var(--accent)] underline underline-offset-4"
          >
            Run it yourself
          </Link>
        </div>
        <div>
          <h3 className="text-lg">Bring your own model</h3>
          <p className="mt-2 text-sm text-[var(--ink-soft)]">
            Add a provider key and AI calls drop from {credits.llm} credits to {credits.llmByok}.
            You pay the model provider directly, at their rates.
          </p>
        </div>
        <div>
          <h3 className="text-lg">Enterprise</h3>
          <p className="mt-2 text-sm text-[var(--ink-soft)]">
            Millions of credits, higher rate limits, a dedicated region or an invoice instead of a
            card. We can do all four.
          </p>
          <Link
            href="/enterprise"
            className="mt-3 inline-block text-sm text-[var(--accent)] underline underline-offset-4"
          >
            Talk to us
          </Link>
        </div>
      </section>
    </div>
  );
}
