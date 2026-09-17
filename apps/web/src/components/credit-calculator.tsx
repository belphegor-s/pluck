"use client";

import { CREDIT_USD, credits } from "@pluck/shared";
import { useState } from "react";

const sliders = [
  {
    key: "scrapes",
    label: "Pages scraped",
    max: 200_000,
    step: 500,
    cost: credits.scrape,
    start: 20_000,
  },
  {
    key: "rendered",
    label: "…needing a browser",
    max: 100_000,
    step: 500,
    cost: credits.browserRender,
    start: 4_000,
  },
  {
    key: "extracts",
    label: "AI extractions",
    max: 50_000,
    step: 100,
    cost: credits.scrape + credits.llm,
    start: 1_000,
  },
  {
    key: "brands",
    label: "Brand lookups",
    max: 50_000,
    step: 100,
    cost: credits.brand,
    start: 200,
  },
] as const;

type Key = (typeof sliders)[number]["key"];

export function CreditCalculator() {
  const [values, setValues] = useState<Record<Key, number>>(
    () => Object.fromEntries(sliders.map((s) => [s.key, s.start])) as Record<Key, number>,
  );

  const total = sliders.reduce((sum, s) => sum + values[s.key] * s.cost, 0);
  const usd = total * CREDIT_USD;

  return (
    <div className="sheet p-5">
      {sliders.map((s) => (
        <label key={s.key} className="mt-4 block first:mt-0">
          <span className="flex items-baseline justify-between text-sm">
            <span className="text-[var(--ink-soft)]">{s.label}</span>
            <span className="mono">{values[s.key].toLocaleString()}</span>
          </span>
          <input
            type="range"
            min={0}
            max={s.max}
            step={s.step}
            value={values[s.key]}
            onChange={(e) => setValues((v) => ({ ...v, [s.key]: Number(e.target.value) }))}
            className="mt-1 w-full accent-[var(--accent)]"
          />
        </label>
      ))}
      <div className="mt-6 flex items-baseline justify-between border-t border-[var(--line)] pt-4">
        <span className="text-sm text-[var(--ink-soft)]">Per month</span>
        <span className="mono text-2xl">${usd.toFixed(2)}</span>
      </div>
      <p className="mt-1 text-xs text-[var(--ink-faint)]">
        {total.toLocaleString()} credits. Bonus credits on larger packs bring this down.
      </p>
    </div>
  );
}
