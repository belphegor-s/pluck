"use client";

import { useState } from "react";

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
  const [copied, setCopied] = useState(false);
  const sample = samples[active]!;

  return (
    <div className={`sheet overflow-hidden ${className}`}>
      <div className="flex items-center gap-1 border-b border-[var(--line)] px-2">
        {samples.map((s, i) => (
          <button
            key={s.label}
            type="button"
            onClick={() => setActive(i)}
            aria-pressed={i === active}
            className={`px-3 py-2 text-xs transition-colors ${
              i === active
                ? "text-[var(--ink)] shadow-[inset_0_-2px_0_var(--accent)]"
                : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
            }`}
          >
            {s.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(sample.code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          }}
          className="ml-auto px-3 py-2 text-xs text-[var(--ink-faint)] transition-colors hover:text-[var(--ink)]"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div
        className="shiki-block overflow-x-auto p-4 text-[0.8rem] leading-relaxed"
        // Highlighted on the server from source strings in this repo.
        dangerouslySetInnerHTML={{ __html: sample.html }}
      />
    </div>
  );
}
