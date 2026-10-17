"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import { TabIndicator } from "@/components/tab-indicator";

interface Rendered {
  label: string;
  code: string;
  html: string;
}

export function CodeTabsClient({
  samples,
  className = "",
}: {
  samples: Rendered[];
  className?: string;
}) {
  const [active, setActive] = useState(0);
  // Which way the last switch went; "none" until there has been one.
  const [direction, setDirection] = useState<"left" | "right" | "none">("none");
  const [copied, setCopied] = useState(false);
  // The label only rolls once it has something to roll from.
  const [touched, setTouched] = useState(false);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const id = useId();
  const sample = samples[active]!;

  const select = (index: number, focus = false) => {
    if (focus) tabs.current[index]?.focus();
    if (index === active) return;
    setDirection(index > active ? "right" : "left");
    setActive(index);
  };

  // Arrow keys move along the tabs, as in any tab list; Home and End jump.
  const onKeyDown = (event: React.KeyboardEvent) => {
    const last = samples.length - 1;
    const next =
      event.key === "ArrowRight"
        ? active === last
          ? 0
          : active + 1
        : event.key === "ArrowLeft"
          ? active === 0
            ? last
            : active - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    select(next, true);
  };

  return (
    <div className={`sheet overflow-hidden ${className}`}>
      <div className="flex items-center border-b border-[var(--line)] px-2">
        <div
          role="tablist"
          aria-label="Code samples"
          onKeyDown={onKeyDown}
          className="relative isolate flex min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none]"
        >
          <TabIndicator variant="underline" className="bg-[var(--accent)]" />
          {samples.map((s, i) => (
            <button
              key={s.label}
              ref={(el) => {
                tabs.current[i] = el;
              }}
              id={`${id}-tab-${i}`}
              type="button"
              role="tab"
              aria-selected={i === active}
              aria-controls={`${id}-panel`}
              tabIndex={i === active ? 0 : -1}
              onClick={() => select(i)}
              // The list scrolls on a phone, which would clip an outside focus ring.
              className={`shrink-0 whitespace-nowrap px-3 py-2 text-xs transition-colors duration-300 focus-visible:outline-offset-[-2px] ${
                i === active
                  ? "text-[var(--ink)] shadow-[inset_0_-2px_0_var(--accent)]"
                  : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(sample.code);
            setCopied(true);
            setTouched(true);
            setTimeout(() => setCopied(false), 1600);
          }}
          aria-label={copied ? "Copied" : `Copy ${sample.label} sample`}
          className="ml-auto shrink-0 overflow-hidden px-3 py-2 text-xs text-[var(--ink-faint)] transition-colors hover:text-[var(--ink)]"
        >
          <span
            key={String(copied)}
            className={`${touched ? "swap-in" : ""} ${copied ? "text-[var(--leaf)]" : ""}`}
          >
            {copied ? "Copied" : "Copy"}
          </span>
        </button>
      </div>
      <AutoHeight>
        <div
          // A new key per tab replays the arrival; the direction says where from.
          key={active}
          id={`${id}-panel`}
          role="tabpanel"
          aria-labelledby={`${id}-tab-${active}`}
          data-direction={direction}
          className="tab-panel shiki-block overflow-x-auto p-4 text-[0.875rem] leading-relaxed"
          // Highlighted on the server from source strings in this repo.
          dangerouslySetInnerHTML={{ __html: sample.html }}
        />
      </AutoHeight>
    </div>
  );
}

/**
 * Samples are rarely the same length; without this the card snaps taller or
 * shorter on every switch and shoves the page below it. The outer box follows
 * the inner one's height with a transition instead. Until it has measured
 * once it is plain `auto`, so the server-rendered page is laid out normally.
 */
function AutoHeight({ children }: { children: React.ReactNode }) {
  const outer = useRef<HTMLDivElement | null>(null);
  const inner = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const box = outer.current;
    const content = inner.current;
    if (!box || !content) return;
    let first = true;
    const observer = new ResizeObserver(() => {
      const height = `${content.offsetHeight}px`;
      if (first) {
        // The first measurement is where it already is; nothing to animate.
        box.style.transition = "none";
        box.style.height = height;
        void box.offsetHeight;
        box.style.transition = "";
        first = false;
        return;
      }
      box.style.height = height;
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={outer} className="auto-height">
      <div ref={inner}>{children}</div>
    </div>
  );
}
