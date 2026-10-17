"use client";

import { useState } from "react";

/** Copy control for a single block of text. Shows what it did. */
export function CopyButton({
  text,
  className = "",
  label = "Copy",
  copiedLabel = "Copied",
}: {
  text: string;
  className?: string;
  label?: string;
  copiedLabel?: string;
}) {
  const [copied, setCopied] = useState(false);
  // The label only rolls once it has something to roll from.
  const [touched, setTouched] = useState(false);

  return (
    <button
      type="button"
      aria-label={label === "Copy" ? "Copy to clipboard" : label}
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTouched(true);
          setTimeout(() => setCopied(false), 1600);
        });
      }}
      className={`overflow-hidden border border-[var(--line)] bg-[var(--paper)] px-2 py-1 text-xs text-[var(--ink-soft)] transition-colors hover:text-[var(--ink)] ${className}`}
    >
      <span
        key={String(copied)}
        className={`${touched ? "swap-in" : ""} ${copied ? "text-[var(--leaf)]" : ""}`}
      >
        {copied ? copiedLabel : label}
      </span>
    </button>
  );
}
