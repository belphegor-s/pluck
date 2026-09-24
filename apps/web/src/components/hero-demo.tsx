"use client";

import { useEffect, useRef, useState } from "react";
import { JsonView } from "@/components/json-view";
import { MarkdownView } from "@/components/markdown-view";

type Tab = "markdown" | "links" | "metadata";

interface DemoResult {
  markdown: string;
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

export function HeroDemo() {
  const [url, setUrl] = useState("");
  const [tab, setTab] = useState<Tab>("markdown");
  const [state, setState] = useState<"idle" | "working" | "done" | "error">("idle");
  const [result, setResult] = useState<DemoResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const output = useRef<HTMLDivElement | null>(null);

  // The one piece of unprompted motion on the page: the plucked text arriving.
  // Keyed on the result alone: switching tabs must not replay it.
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
    setResult(null);
    const res = await fetch("/api/demo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: target }),
    }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as (DemoResult & { error?: string }) | null;
    if (!res?.ok || !body || body.error) {
      setState("error");
      setMessage(body?.error ?? "Something went wrong. Try another URL.");
      return;
    }
    setResult(body);
    setState("done");
    setTab("markdown");
  }

  const title = (result?.metadata?.title as string | undefined) ?? null;

  return (
    <div className="sheet overflow-hidden">
      <form
        className="flex flex-col gap-2 border-b border-[var(--line)] p-3 sm:flex-row"
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
          className="mono min-w-0 flex-1 bg-transparent px-2 py-2 text-sm outline-none placeholder:text-[var(--ink-faint)]"
        />
        <button
          type="submit"
          disabled={state === "working"}
          className="shrink-0 bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-60"
        >
          {state === "working" ? "Plucking…" : "Pluck it"}
        </button>
      </form>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-[var(--line)] px-4 py-2 text-xs text-[var(--ink-faint)]">
        {state === "idle" && (
          <>
            <span>Try</span>
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
        {state === "working" && <span>Fetching, rendering if needed, cleaning…</span>}
        {state === "error" && <span className="text-[var(--accent)]">{message}</span>}
        {state === "done" && result && (
          <>
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
            <span className="mono ml-auto">
              {result.renderedWith === "browser" ? "browser render" : "http fetch"} ·{" "}
              {result.durationMs} ms
            </span>
          </>
        )}
      </div>

      <div
        ref={output}
        className="relative h-[17rem] overflow-auto bg-[var(--sheet)] p-4 sm:h-[19rem]"
      >
        {state === "idle" && <IdlePreview />}
        {state === "working" && <Skeleton />}
        {state === "done" && result && tab === "markdown" && (
          <div className="text-[0.8rem] leading-relaxed">
            <MarkdownView
              value={title ? `# ${title}\n\n${typed}` : typed}
              className="text-[0.8rem] leading-relaxed"
            />
            {typing && (
              <span className="mono animate-[caret_1s_steps(1)_infinite] text-[var(--accent)]">
                ▌
              </span>
            )}
          </div>
        )}
        {state === "done" && result && tab === "links" && (
          <ul className="mono space-y-1 text-[0.8rem]">
            {result.links.map((link) => (
              <li key={link} className="truncate text-[var(--ink-soft)]">
                {link}
              </li>
            ))}
          </ul>
        )}
        {state === "done" && result && tab === "metadata" && (
          <JsonView value={JSON.stringify(result.metadata, null, 2)} className="text-[0.8rem]" />
        )}
        {state === "error" && <IdlePreview />}
      </div>
    </div>
  );
}

function IdlePreview() {
  return (
    <div className="space-y-2 text-[0.8rem]">
      <p className="mono">
        <span className="text-[var(--accent)]">POST</span>{" "}
        <span className="text-[var(--ink)]">/v1/scrape</span>
      </p>
      <JsonView
        value={`{\n  "url": "https://example.com",\n  "formats": ["markdown"]\n}`}
        className="text-[0.8rem]"
      />
      <p className="mono pt-4 text-[var(--ink-faint)]">
        Paste a URL above to see what your model would receive.
      </p>
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
