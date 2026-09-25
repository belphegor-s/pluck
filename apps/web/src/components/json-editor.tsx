"use client";

import { useEffect, useRef, useState } from "react";
import { JsonView } from "@/components/json-view";

/**
 * An editable, syntax-coloured JSON field.
 *
 * A textarea cannot colour its own text, so the coloured copy sits behind a
 * transparent one and the two are kept in lockstep: identical font, padding and
 * wrapping, and the backdrop follows the textarea's scroll. Editing, selection,
 * spellcheck and mobile keyboards all still come from the real textarea.
 */
export function JsonEditor({
  value,
  onChange,
  rows = 14,
  label,
  fill = false,
}: {
  value: string;
  onChange: (next: string) => void;
  rows?: number;
  label: string;
  /** Take the parent's full height instead of a row count, for panel layouts. */
  fill?: boolean;
}) {
  const input = useRef<HTMLTextAreaElement | null>(null);
  const backdrop = useRef<HTMLDivElement | null>(null);
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    if (!value.trim()) {
      setInvalid(false);
      return;
    }
    try {
      JSON.parse(value);
      setInvalid(false);
    } catch {
      setInvalid(true);
    }
  }, [value]);

  const sync = () => {
    const el = input.current;
    const shadow = backdrop.current;
    if (!el || !shadow) return;
    shadow.scrollTop = el.scrollTop;
    shadow.scrollLeft = el.scrollLeft;
  };

  // Tab belongs to the editor here, not to the page: this is a code field.
  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Tab" || event.shiftKey) return;
    event.preventDefault();
    const el = event.currentTarget;
    const { selectionStart, selectionEnd } = el;
    const next = `${value.slice(0, selectionStart)}  ${value.slice(selectionEnd)}`;
    onChange(next);
    requestAnimationFrame(() => {
      el.selectionStart = el.selectionEnd = selectionStart + 2;
    });
  };

  const shared =
    "mono block w-full whitespace-pre-wrap break-words p-3 text-xs leading-relaxed tracking-normal";

  return (
    <div
      className={`relative border bg-[var(--sheet)] transition-colors focus-within:border-[var(--accent)] ${fill ? "h-full" : ""} ${
        invalid ? "border-[var(--accent)]" : "border-[var(--line)]"
      }`}
    >
      <div
        ref={backdrop}
        aria-hidden
        className={`${shared} pointer-events-none absolute inset-0 overflow-hidden`}
      >
        {/* The trailing newline keeps the last line visible while typing it. */}
        <JsonView value={`${value}\n`} className="text-xs leading-relaxed" />
      </div>
      <textarea
        ref={input}
        aria-label={label}
        aria-invalid={invalid}
        value={value}
        rows={rows}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        onChange={(e) => onChange(e.target.value)}
        onScroll={sync}
        onKeyDown={onKeyDown}
        className={`${shared} relative bg-transparent text-transparent caret-[var(--ink)] outline-none ${fill ? "h-full resize-none" : "resize-y"}`}
      />
      {invalid && (
        <p className="absolute bottom-1 right-2 text-[0.75rem] text-[var(--accent)]">
          not valid JSON yet
        </p>
      )}
    </div>
  );
}
