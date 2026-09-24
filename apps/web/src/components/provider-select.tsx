"use client";

import { DEFAULT_MODELS, PROVIDER_LABELS, PROVIDERS } from "@pluck/ai";
import { Check, ChevronDown, Shuffle, Sparkles, SquareTerminal, Zap } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

type Provider = (typeof PROVIDERS)[number];

/** Small, recognisable marks. Brand glyphs, drawn rather than fetched. */
function ProviderIcon({ provider }: { provider: Provider }) {
  const common = { width: 16, height: 16, viewBox: "0 0 24 24" } as const;
  switch (provider) {
    case "openai":
      return (
        <svg {...common} aria-hidden="true" fill="currentColor">
          <path d="M21.6 10a5.4 5.4 0 0 0-.5-4.5 5.5 5.5 0 0 0-5.9-2.6A5.4 5.4 0 0 0 11.1 1a5.5 5.5 0 0 0-5.2 3.8A5.4 5.4 0 0 0 2.3 7.4a5.5 5.5 0 0 0 .7 6.4 5.4 5.4 0 0 0 .5 4.5 5.5 5.5 0 0 0 5.9 2.6A5.4 5.4 0 0 0 12.9 23a5.5 5.5 0 0 0 5.2-3.8 5.4 5.4 0 0 0 3.6-2.6 5.5 5.5 0 0 0-.7-6.4Zm-8.7 11.6a4 4 0 0 1-2.6-.9l.1-.1 4.4-2.5c.2-.1.4-.4.4-.7v-6.2l1.8 1.1v5.1a4.1 4.1 0 0 1-4.1 4.2ZM4.6 17a4 4 0 0 1-.5-2.7l.1.1 4.4 2.5c.2.1.5.1.7 0l5.4-3.1v2.1l-4.5 2.6a4.1 4.1 0 0 1-5.6-1.5Zm-1.1-9.3a4 4 0 0 1 2.2-1.8v5.2c0 .3.1.5.4.7l5.4 3.1-1.8 1-4.5-2.6a4.1 4.1 0 0 1-1.7-5.6Zm15.3 3.6-5.4-3.2 1.8-1 4.5 2.6a4.1 4.1 0 0 1-.6 7.4v-5.2c0-.3-.1-.5-.3-.6Zm1.8-2.7-.1-.1-4.4-2.6a.7.7 0 0 0-.7 0L10 9v-2.1l4.5-2.6a4.1 4.1 0 0 1 6.1 4.3ZM9 13.1l-1.8-1V6.9c0-2.3 1.8-4.1 4.1-4.1a4 4 0 0 1 2.6.9l-.1.1-4.4 2.5c-.2.1-.4.4-.4.7Zm1-2.1L12.4 9.6l2.4 1.4v2.8l-2.4 1.4L10 13.8Z" />
        </svg>
      );
    case "anthropic":
      return (
        <svg {...common} aria-hidden="true" fill="currentColor">
          <path d="M14.6 3h-3L17 21h3.5L14.6 3ZM6.9 3 1 21h3.6l1.2-3.7h6L13 21h3.6L10.7 3H6.9Zm-.2 11.2 2-6.2 2 6.2h-4Z" />
        </svg>
      );
    case "google":
      return <Sparkles aria-hidden="true" className="size-4" strokeWidth={1.75} />;
    case "groq":
      return <Zap aria-hidden="true" className="size-4" strokeWidth={1.75} />;
    case "openrouter":
      return <Shuffle aria-hidden="true" className="size-4" strokeWidth={1.75} />;
    default:
      return <SquareTerminal aria-hidden="true" className="size-4" strokeWidth={1.75} />;
  }
}

/**
 * A listbox rather than a styled `<select>`: native option lists cannot carry
 * icons or descriptions. Keyboard behaviour mirrors the native control:
 * arrows move, Home/End jump, typing seeks, Enter picks, Escape closes. And
 * the value still posts with the form through a hidden input.
 */
export function ProviderSelect({
  name,
  value,
  onChange,
}: {
  name: string;
  value: Provider;
  onChange: (provider: Provider) => void;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() => PROVIDERS.indexOf(value));
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const seek = useRef({ text: "", at: 0 });
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (open)
      listRef.current
        ?.querySelector<HTMLElement>('[data-active="true"]')
        ?.scrollIntoView({ block: "nearest" });
  }, [open]);

  const commit = (index: number) => {
    const next = PROVIDERS[index];
    if (!next) return;
    onChange(next);
    setActiveIndex(index);
    setOpen(false);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    const last = PROVIDERS.length - 1;
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp": {
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        if (!open) {
          setOpen(true);
          return;
        }
        setActiveIndex((i) => Math.min(last, Math.max(0, i + step)));
        return;
      }
      case "Home":
        event.preventDefault();
        setActiveIndex(0);
        return;
      case "End":
        event.preventDefault();
        setActiveIndex(last);
        return;
      case "Enter":
      case " ":
        event.preventDefault();
        if (open) commit(activeIndex);
        else setOpen(true);
        return;
      case "Escape":
        setOpen(false);
        return;
      case "Tab":
        setOpen(false);
        return;
      default: {
        if (event.key.length !== 1) return;
        const now = Date.now();
        seek.current.text = now - seek.current.at > 800 ? event.key : seek.current.text + event.key;
        seek.current.at = now;
        const match = PROVIDERS.findIndex((p) =>
          PROVIDER_LABELS[p].toLowerCase().startsWith(seek.current.text.toLowerCase()),
        );
        if (match >= 0) {
          setActiveIndex(match);
          if (!open) commit(match);
        }
      }
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <input type="hidden" name={name} value={value} />
      <button
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-haspopup="listbox"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKeyDown}
        className="flex w-full items-center gap-2 border border-[var(--line)] bg-[var(--sheet)] px-3 py-2 text-left text-sm transition-colors hover:border-[var(--ink-faint)] focus-visible:border-[var(--accent)]"
      >
        <span className="text-[var(--ink-soft)]">
          <ProviderIcon provider={value} />
        </span>
        <span className="flex-1 truncate">{PROVIDER_LABELS[value]}</span>
        <ChevronDown
          aria-hidden="true"
          strokeWidth={2.5}
          className={`size-3 shrink-0 text-[var(--ink-faint)] transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label="Model provider"
          className="sheet absolute z-30 mt-1 max-h-72 w-full overflow-auto p-1 shadow-lg"
        >
          {PROVIDERS.map((provider, index) => {
            const selected = provider === value;
            const active = index === activeIndex;
            return (
              <button
                key={provider}
                type="button"
                role="option"
                aria-selected={selected}
                data-active={active}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => commit(index)}
                className={`flex w-full items-start gap-2.5 px-2.5 py-2 text-left text-sm transition-colors ${
                  active ? "bg-[var(--accent-wash)] text-[var(--ink)]" : "text-[var(--ink-soft)]"
                }`}
              >
                <span
                  className={`mt-0.5 ${selected ? "text-[var(--accent)]" : "text-[var(--ink-faint)]"}`}
                >
                  <ProviderIcon provider={provider} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[var(--ink)]">
                    {PROVIDER_LABELS[provider]}
                  </span>
                  <span className="mono block truncate text-xs text-[var(--ink-faint)]">
                    {DEFAULT_MODELS[provider] ?? "your own endpoint"}
                  </span>
                </span>
                {selected && (
                  <Check
                    aria-hidden="true"
                    strokeWidth={3}
                    className="size-3.5 shrink-0 text-[var(--accent)]"
                  />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
