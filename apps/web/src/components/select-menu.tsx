"use client";

import { useEffect, useId, useRef, useState } from "react";

export interface SelectOption<V extends string | number> {
  value: V;
  label: string;
  hint?: string;
}

/**
 * A single-choice listbox that posts with its form.
 *
 * Styled selects cannot match the rest of the interface on every platform, and
 * on a phone the native one opens a system wheel. This keeps the native
 * keyboard behaviour — arrows move, Home/End jump, typing seeks, Enter picks,
 * Escape closes — and writes the choice to a hidden input, so it drops into a
 * server-action form like any other field.
 */
export function SelectMenu<V extends string | number>({
  name,
  options,
  defaultValue,
  label,
  onChange,
}: {
  name: string;
  options: readonly SelectOption<V>[];
  defaultValue: V;
  /** Accessible name for the list, e.g. "Check interval". */
  label: string;
  onChange?: (value: V) => void;
}) {
  const [value, setValue] = useState<V>(defaultValue);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() =>
    Math.max(
      0,
      options.findIndex((o) => o.value === defaultValue),
    ),
  );
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
    const next = options[index];
    if (!next) return;
    setValue(next.value);
    setActiveIndex(index);
    setOpen(false);
    onChange?.(next.value);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    const last = options.length - 1;
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp": {
        event.preventDefault();
        if (!open) {
          setOpen(true);
          return;
        }
        const step = event.key === "ArrowDown" ? 1 : -1;
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
      case "Tab":
        setOpen(false);
        return;
      default: {
        if (event.key.length !== 1) return;
        const now = Date.now();
        seek.current.text = now - seek.current.at > 800 ? event.key : seek.current.text + event.key;
        seek.current.at = now;
        const match = options.findIndex((o) =>
          o.label.toLowerCase().startsWith(seek.current.text.toLowerCase()),
        );
        if (match >= 0) {
          setActiveIndex(match);
          if (!open) commit(match);
        }
      }
    }
  };

  const selected = options.find((o) => o.value === value) ?? options[0];

  return (
    <div ref={rootRef} className="relative">
      <input type="hidden" name={name} value={String(value)} />
      <button
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-haspopup="listbox"
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKeyDown}
        className="mt-1 flex w-full items-center gap-2 border border-[var(--line)] bg-[var(--sheet)] px-3 py-2 text-left text-sm transition-colors hover:border-[var(--ink-faint)] focus-visible:border-[var(--accent)]"
      >
        <span className="flex-1 truncate">{selected?.label}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          className={`shrink-0 text-[var(--ink-faint)] transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="m5 9 7 7 7-7" />
        </svg>
      </button>

      {open && (
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={label}
          className="sheet absolute z-30 mt-1 max-h-72 w-full overflow-y-auto overflow-x-hidden p-1 shadow-lg"
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            const active = index === activeIndex;
            return (
              <button
                key={String(option.value)}
                type="button"
                role="option"
                aria-selected={isSelected}
                data-active={active}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => commit(index)}
                className={`flex w-full items-center gap-2 px-2.5 py-2 text-left text-sm transition-colors ${
                  active ? "bg-[var(--accent-wash)] text-[var(--ink)]" : "text-[var(--ink-soft)]"
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[var(--ink)]">{option.label}</span>
                  {option.hint && (
                    <span className="block truncate text-xs text-[var(--ink-faint)]">
                      {option.hint}
                    </span>
                  )}
                </span>
                {isSelected && (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="shrink-0 text-[var(--accent)]"
                  >
                    <path d="m5 13 4 4L19 7" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
