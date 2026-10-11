"use client";

import { useEffect, useRef, useState } from "react";
import { HERO_SAMPLE } from "@/components/hero-sample";
import { JsonView } from "@/components/json-view";
import { MarkdownView } from "@/components/markdown-view";
import { formatNumber } from "@/lib/format";

type Tab = "markdown" | "links" | "metadata";

interface DemoResult {
  url: string;
  html: string;
  htmlBytes: number;
  markdown: string;
  markdownBytes: number;
  links: string[];
  metadata: Record<string, unknown>;
  renderedWith: string;
  durationMs: number;
}

const SAMPLES = [
  "https://news.ycombinator.com",
  "https://stripe.com/pricing",
  "https://en.wikipedia.org/wiki/Web_scraping",
];

const kb = (bytes: number) =>
  bytes < 10_000
    ? `${(bytes / 1000).toFixed(1)} kB`
    : `${formatNumber(Math.round(bytes / 1000))} kB`;

const seconds = (ms: number) => (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);

/**
 * The hero is the product doing its one job, side by side: on the left the
 * HTML a site actually sends, on the right the page a model gets. Between
 * them is the mark from the logo, a stem with one berry, and the berry is
 * what gets plucked: it sits on the stem, lifts while a page is being read,
 * and lands on the result.
 *
 * It opens on a real run (see hero-sample.ts) so there is something true to
 * look at before anyone types a URL.
 */
export function HeroDemo() {
  const [url, setUrl] = useState<string>(HERO_SAMPLE.url);
  const [tab, setTab] = useState<Tab>("markdown");
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
  }

  // The last good run stays on screen through a new fetch or a failure.
  const shown: DemoResult = result ?? HERO_SAMPLE;
  const title = result ? ((result.metadata?.title as string | undefined) ?? null) : null;
  const lighter = shown.markdownBytes > 0 ? Math.round(shown.htmlBytes / shown.markdownBytes) : 0;
  const working = state === "working";
  // Where the berry is: on the stem, lifting off it, or landed on the result.
  const berry = working ? "lifting" : state === "error" ? "stem" : result ? "plucked" : "arrive";

  return (
    <div className="flex h-full min-h-0 flex-col">
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
          className="mono min-w-0 flex-1 bg-transparent px-3 py-2 text-base outline-none placeholder:text-[var(--ink-faint)]"
        />
        <button
          type="submit"
          disabled={working}
          className="shrink-0 bg-[var(--accent)] px-6 py-2.5 font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {working ? "Plucking…" : "Pluck it"}
        </button>
      </form>

      <div
        className="flex min-h-[2.25rem] flex-wrap items-center gap-x-4 gap-y-1 px-1 py-2 text-xs text-[var(--ink-faint)]"
        aria-live="polite"
      >
        {working ? (
          <span>Fetching, rendering if needed, cleaning…</span>
        ) : state === "error" ? (
          <span className="text-[var(--accent)]">{message}</span>
        ) : (
          <>
            <span>Or try</span>
            {SAMPLES.map((sample) => (
              <button
                key={sample}
                type="button"
                onClick={() => {
                  setUrl(sample);
                  void run(sample);
                }}
                className="mono underline decoration-dotted underline-offset-4 transition-colors hover:text-[var(--ink)]"
              >
                {sample.replace(/^https?:\/\//, "")}
              </button>
            ))}
          </>
        )}
        {!working && (
          <span className="mono ml-auto">
            {shown.renderedWith === "browser" ? "browser render" : "http fetch"},{" "}
            {seconds(shown.durationMs)}
          </span>
        )}
      </div>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,0.8fr)_6.5rem_minmax(0,1.2fr)]">
        {/* What the site sent. Decorative on purpose: nobody reads it, which is the point. */}
        <figure
          className="sheet hidden min-h-0 flex-col overflow-hidden lg:flex"
          aria-hidden="true"
        >
          <figcaption className="flex h-10 shrink-0 items-center justify-between border-b border-[var(--line)] px-4 text-sm">
            <span className="text-[var(--ink-soft)]">The HTML</span>
            <span className="mono text-xs text-[var(--ink-faint)]">{kb(shown.htmlBytes)}</span>
          </figcaption>
          <div className="relative min-h-0 flex-1">
            <pre
              className={`mono absolute inset-0 overflow-hidden whitespace-pre-wrap break-all p-4 text-[0.6875rem] leading-[1.5] text-[var(--ink-faint)] transition-opacity duration-300 [mask-image:linear-gradient(to_bottom,#000_55%,transparent_96%)] ${working ? "opacity-40" : ""}`}
            >
              {shown.html}
            </pre>
            <p className="mono absolute bottom-3 left-4 text-xs text-[var(--ink-soft)]">
              and {kb(Math.max(0, shown.htmlBytes - shown.html.length))} more of this
            </p>
          </div>
        </figure>

        <Sprig />

        <section className="sheet flex min-h-0 flex-col shadow-[var(--shadow-press)]">
          <div className="flex min-h-10 shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-[var(--line)] px-4 py-2 text-sm lg:h-10 lg:flex-nowrap lg:py-0">
            <h2 className="flex items-center gap-2 font-[family-name:var(--font-sans)] text-sm font-normal tracking-normal text-[var(--ink-soft)]">
              <span className="hero-berry" data-at={berry} aria-hidden="true" />
              The page
            </h2>
            <div className="flex gap-3 text-xs text-[var(--ink-faint)]">
              {(["markdown", "links", "metadata"] as Tab[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  aria-pressed={tab === t}
                  className={
                    tab === t
                      ? "text-[var(--ink)] underline underline-offset-4"
                      : "transition-colors hover:text-[var(--ink)]"
                  }
                >
                  {t}
                </button>
              ))}
            </div>
            <p className="mono ml-auto flex gap-3 text-xs text-[var(--ink-faint)]">
              <span>{kb(shown.markdownBytes)}</span>
              {lighter > 1 && <span className="text-[var(--leaf)]">{lighter}× lighter</span>}
            </p>
          </div>

          <div ref={output} className="h-[13rem] overflow-auto p-4 lg:h-auto lg:min-h-0 lg:flex-1">
            {working ? (
              <Skeleton />
            ) : tab === "markdown" ? (
              <div className={result ? undefined : "hero-reveal"}>
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
              <ul className="mono space-y-1 text-[0.875rem]">
                {shown.links.map((link) => (
                  <li key={link} className="truncate text-[var(--ink-soft)]">
                    {link}
                  </li>
                ))}
              </ul>
            ) : (
              <JsonView
                value={JSON.stringify(shown.metadata, null, 2)}
                className="text-[0.875rem]"
              />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

/**
 * The stem the berry is plucked from: the logo's own drawing, grown a little,
 * rooted in the HTML and reaching toward the page. Wide screens only; on a
 * phone there is no HTML pane for it to grow out of.
 */
function Sprig() {
  return (
    <div className="relative hidden lg:block">
      <svg
        aria-hidden="true"
        viewBox="0 0 104 232"
        className="absolute left-0 top-0 h-[14.5rem] w-full overflow-visible"
        fill="none"
        stroke="var(--ink)"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M-1 222C22 219 38 196 47 162S60 78 84 25" />
        <g fill="color-mix(in srgb, var(--leaf) 28%, transparent)" strokeWidth="1.4">
          <path d="M42 180C24 180 10 168 6 150c18-2 32 10 36 30Z" />
          <path d="M53 132c15 6 32 2 43-11-14-9-32-4-43 11Z" />
          <path d="M60 92C46 88 36 76 35 60c15 3 25 15 25 32Z" />
        </g>
        <g strokeWidth="1">
          <path d="M42 180C32 169 20 159 6 150" />
          <path d="M53 132c13-6 28-10 43-11" />
          <path d="M60 92C54 80 46 69 35 60" />
        </g>
        {/* The calyx left behind once the berry is gone. */}
        <path d="M84 25l-8-3M84 25l3-9" strokeWidth="1.3" />
      </svg>
    </div>
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
