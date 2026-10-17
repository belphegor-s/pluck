"use client";

import { useEffect, useRef, useState } from "react";
import { HERO_SAMPLE } from "@/components/hero-sample";
import { JsonView } from "@/components/json-view";
import { MarkdownView } from "@/components/markdown-view";
import { TabIndicator } from "@/components/tab-indicator";
import { formatNumber } from "@/lib/format";

type Tab = "markdown" | "links" | "metadata";

interface DemoResult {
  url: string;
  htmlBytes: number;
  markdown: string;
  markdownBytes: number;
  links: string[];
  metadata: Record<string, unknown>;
}

const TABS: Tab[] = ["markdown", "links", "metadata"];

const SAMPLES = [
  { label: "Hacker News", url: "https://news.ycombinator.com" },
  { label: "Stripe pricing", url: "https://stripe.com/pricing" },
  { label: "Wikipedia", url: "https://en.wikipedia.org/wiki/Web_scraping" },
];

const kb = (bytes: number) =>
  bytes < 10_000
    ? `${(bytes / 1000).toFixed(1)} kB`
    : `${formatNumber(Math.round(bytes / 1000))} kB`;

/**
 * The product doing its one job: a URL goes in, the page a model would get
 * comes out, with how much HTML was thrown away to get there.
 *
 * Tucked behind the result is the mark from the logo, a stem with one berry,
 * and the berry is what gets plucked: it sits on the stem, lifts while a page
 * is being read, and lands on the result.
 *
 * It opens on a real run (see hero-sample.ts) so there is something true to
 * look at before anyone types a URL.
 */
export function HeroDemo() {
  const [url, setUrl] = useState<string>(HERO_SAMPLE.url);
  const [tab, setTab] = useState<Tab>("markdown");
  const [direction, setDirection] = useState<"left" | "right" | "none">("none");
  const [state, setState] = useState<"sample" | "working" | "done" | "error">("sample");
  const [result, setResult] = useState<DemoResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const output = useRef<HTMLDivElement | null>(null);

  // A plucked page arrives as if written out. Keyed on the result alone:
  // switching tabs must not replay it.
  useEffect(() => {
    if (!result) return;
    const full = result.markdown;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setTyped(full);
      return;
    }
    setTyped("");
    let i = 0;
    timer.current = setInterval(() => {
      i = Math.min(full.length, i + 28);
      setTyped(full.slice(0, i));
      if (i >= full.length && timer.current) clearInterval(timer.current);
    }, 16);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [result]);

  // Follow the text as it arrives, but leave the reader alone once they scroll.
  const typing = Boolean(result) && typed.length < (result?.markdown.length ?? 0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `typed` drives the scroll.
  useEffect(() => {
    const el = output.current;
    if (!el || tab !== "markdown" || !typing) return;
    el.scrollTop = el.scrollHeight;
  }, [typed, tab, typing]);

  async function run(target: string) {
    if (!target) return;
    setState("working");
    setMessage(null);
    const res = await fetch("/api/demo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: target }),
    }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as
      | (Omit<DemoResult, "url"> & { error?: string })
      | null;
    if (!res?.ok || !body || body.error) {
      setState("error");
      setMessage(body?.error ?? "Something went wrong. Try another URL.");
      return;
    }
    setResult({ ...body, url: target });
    setState("done");
    setTab("markdown");
    setDirection("none");
  }

  // The last good run stays on screen through a new fetch or a failure.
  const shown: DemoResult = result ?? HERO_SAMPLE;
  const title = result ? ((result.metadata?.title as string | undefined) ?? null) : null;
  const working = state === "working";
  // Where the berry is: on the stem, lifting off it, or landed on the result.
  const berry = working ? "lifting" : state === "error" ? "stem" : result ? "plucked" : "arrive";

  return (
    <div>
      <form
        className="sheet flex flex-col gap-2 p-2 shadow-[var(--shadow-press)] sm:flex-row sm:items-center"
        onSubmit={(e) => {
          e.preventDefault();
          void run(url.trim());
        }}
      >
        <label className="sr-only" htmlFor="demo-url">
          URL to pluck
        </label>
        <input
          id="demo-url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/pricing"
          inputMode="url"
          autoComplete="url"
          spellCheck={false}
          className="mono min-w-0 flex-1 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-[var(--ink-faint)]"
        />
        <button
          type="submit"
          disabled={working}
          className="shrink-0 bg-[var(--accent)] px-5 py-2 font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {working ? "Plucking…" : "Pluck it"}
        </button>
      </form>

      {/* One quiet line under the bar: what to try, what is happening, or the
          other views of a page once there is one. */}
      <div
        className="relative isolate flex min-h-9 flex-wrap items-center gap-x-4 gap-y-1 px-1 py-2 text-xs text-[var(--ink-faint)]"
        aria-live="polite"
      >
        <TabIndicator variant="underline" thickness={1} className="bg-[var(--ink)]" />
        {working && <span>Fetching, rendering if needed, cleaning…</span>}
        {state === "error" && <span className="text-[var(--accent)]">{message}</span>}
        {state === "sample" && (
          <>
            <span>Try</span>
            {SAMPLES.map((sample) => (
              <button
                key={sample.url}
                type="button"
                onClick={() => {
                  setUrl(sample.url);
                  void run(sample.url);
                }}
                className="underline decoration-dotted underline-offset-4 transition-colors hover:text-[var(--ink)]"
              >
                {sample.label}
              </button>
            ))}
          </>
        )}
        {state === "done" &&
          TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                if (t === tab) return;
                setDirection(TABS.indexOf(t) > TABS.indexOf(tab) ? "right" : "left");
                setTab(t);
              }}
              aria-pressed={tab === t}
              // The padding puts the sliding underline where a text underline would sit.
              className={`pb-0.5 transition-colors duration-300 ${
                tab === t ? "text-[var(--ink)]" : "hover:text-[var(--ink)]"
              }`}
            >
              {t}
            </button>
          ))}
      </div>

      <div className="relative">
        <Sprig />
        <section className="sheet flex flex-col shadow-[var(--shadow-press)]">
          <div className="flex h-10 shrink-0 items-center justify-between gap-4 border-b border-[var(--line)] px-4 text-sm">
            <h2 className="flex shrink-0 items-center gap-2 whitespace-nowrap font-[family-name:var(--font-sans)] text-sm font-normal tracking-normal text-[var(--ink-soft)]">
              <span className="hero-berry" data-at={berry} aria-hidden="true" />
              The page
            </h2>
            <p className="mono truncate text-xs text-[var(--ink-faint)]">
              {kb(shown.htmlBytes)}
              <span className="hidden sm:inline"> of HTML</span> in, {kb(shown.markdownBytes)} out
            </p>
          </div>

          <div ref={output} className="h-[13rem] overflow-auto p-4 lg:h-[clamp(13rem,36svh,19rem)]">
            {working ? (
              <Skeleton />
            ) : tab === "markdown" ? (
              <div
                key="markdown"
                data-direction={direction}
                className={result ? "tab-panel" : "hero-reveal"}
              >
                <MarkdownView
                  value={result ? (title ? `# ${title}\n\n${typed}` : typed) : HERO_SAMPLE.markdown}
                  className="text-[0.875rem] leading-relaxed"
                />
                {typing && (
                  <span className="mono animate-[caret_1s_steps(1)_infinite] text-[var(--accent)]">
                    ▌
                  </span>
                )}
              </div>
            ) : tab === "links" ? (
              <ul
                key="links"
                data-direction={direction}
                className="tab-panel mono space-y-1 text-[0.875rem]"
              >
                {shown.links.map((link) => (
                  <li key={link} className="truncate text-[var(--ink-soft)]">
                    {link}
                  </li>
                ))}
              </ul>
            ) : (
              <div key="metadata" data-direction={direction} className="tab-panel">
                <JsonView
                  value={JSON.stringify(shown.metadata, null, 2)}
                  className="text-[0.875rem]"
                />
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

/**
 * The stem the berry is plucked from: the logo's own drawing, grown a little,
 * pressed under the result sheet with its tip beside "The page". Wide screens
 * only: it lives in the gap between the two columns.
 */
function Sprig() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 104 232"
      className="absolute -left-[6.5rem] top-0 hidden h-[14.5rem] w-[6.5rem] overflow-visible lg:block"
      fill="none"
      stroke="var(--ink)"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M104 214C70 212 36 190 32 150S62 62 84 25" />
      <g fill="color-mix(in srgb, var(--leaf) 30%, transparent)" strokeWidth="1.4">
        <path d="M40 184C22 186 8 176 2 160c17-5 32 4 38 24Z" />
        <path d="M34 132C22 122 18 106 24 90c13 9 17 24 10 42Z" />
        <path d="M54 82c14 7 31 4 42-8-13-10-31-6-42 8Z" />
      </g>
      <g strokeWidth="1">
        <path d="M40 184C29 174 16 166 2 160" />
        <path d="M34 132c-1-14-4-28-10-42" />
        <path d="M54 82c13-5 27-8 42-8" />
      </g>
      {/* The calyx left behind once the berry is gone. */}
      <path d="M84 25l-8-3M84 25l3-9" strokeWidth="1.3" />
    </svg>
  );
}

function Skeleton() {
  const widths = [88, 72, 94, 61, 80, 45, 90, 68, 76];
  return (
    <div className="space-y-3 pt-1">
      {widths.map((w, i) => (
        <div
          key={w + i}
          className="h-3 bg-[var(--line)]"
          style={{
            width: `${w}%`,
            opacity: 0.35 + (i % 3) * 0.12,
            animation: `pluck-in .5s var(--ease-press) ${i * 60}ms both`,
          }}
        />
      ))}
    </div>
  );
}
