"use client";

import { type EndpointId, endpoints } from "@pluck/shared";
import { useEffect, useId, useRef, useState } from "react";

const ids = Object.keys(endpoints) as EndpointId[];

/** Verbs read faster as colour than as text, and match the docs palette. */
export const methodColor = (method: string) =>
  ({
    get: "text-[var(--leaf)]",
    post: "text-[var(--accent)]",
    patch: "text-[var(--amber,#a86a00)]",
    delete: "text-[var(--accent)]",
  })[method.toLowerCase()] ?? "text-[var(--ink-soft)]";

/**
 * The endpoint picker. A native `<select>` cannot colour the verb or show the
 * price beneath each line, and on a phone it hands you a system wheel with 20
 * identical-looking rows; this keeps the same keyboard behaviour and shows the
 * shape of each endpoint.
 */
export function EndpointSelect({
  value,
  onChange,
}: {
  value: EndpointId;
  onChange: (id: EndpointId) => void;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() => ids.indexOf(value));
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
    const next = ids[index];
    if (!next) return;
    onChange(next);
    setActiveIndex(index);
    setOpen(false);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    const last = ids.length - 1;
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
        const match = ids.findIndex((id) =>
          endpoints[id].path.replace("/v1/", "").startsWith(seek.current.text.toLowerCase()),
        );
        if (match >= 0) {
          setActiveIndex(match);
          if (!open) commit(match);
        }
      }
    }
  };

  const selected = endpoints[value];

  return (
    <div ref={rootRef} className="relative">
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
        <span className={`mono shrink-0 text-xs font-medium ${methodColor(selected.method)}`}>
          {selected.method.toUpperCase()}
        </span>
        <span className="mono flex-1 truncate">{selected.path}</span>
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
          aria-label="Endpoint"
          className="sheet absolute z-30 mt-1 max-h-80 w-full overflow-y-auto overflow-x-hidden p-1 shadow-lg"
        >
          {ids.map((id, index) => {
            const endpoint = endpoints[id];
            const isSelected = id === value;
            const active = index === activeIndex;
            return (
              <button
                key={id}
                type="button"
                role="option"
                aria-selected={isSelected}
                data-active={active}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => commit(index)}
                className={`flex w-full items-start gap-2.5 px-2.5 py-2 text-left transition-colors ${
                  active ? "bg-[var(--accent-wash)]" : ""
                }`}
              >
                <span
                  className={`mono mt-0.5 w-12 shrink-0 text-xs font-medium ${methodColor(endpoint.method)}`}
                >
                  {endpoint.method.toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="mono block truncate text-sm text-[var(--ink)]">
                    {endpoint.path}
                  </span>
                  <span className="block truncate text-xs text-[var(--ink-faint)]">
                    {endpoint.description}
                  </span>
                </span>
                {/* Only the headline price: the full cost breakdown runs to a
                      paragraph and belongs under the closed control. */}
                <span className="mono mt-0.5 shrink-0 text-xs text-[var(--ink-faint)]">
                  {endpoint.cost.split(/[.,]/)[0]}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
