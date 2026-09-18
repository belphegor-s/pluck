"use client";

import { useState } from "react";

/** Copy control for a single block of text. Shows what it did. */
export function CopyButton({ text, className = "" }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      aria-label="Copy to clipboard"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        });
      }}
      className={`border border-[var(--line)] bg-[var(--paper)] px-2 py-1 text-xs text-[var(--ink-soft)] transition-colors hover:text-[var(--ink)] ${className}`}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
