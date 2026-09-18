"use client";

import { Fragment, useMemo } from "react";

type Kind =
  | "heading"
  | "link"
  | "code"
  | "fence"
  | "emphasis"
  | "bullet"
  | "quote"
  | "rule"
  | "plain";

const TOKEN =
  /(^#{1,6} .*$)|(^\s*(?:[-*+]|\d+\.) )|(^> .*$)|(^\s*(?:---|\*\*\*|___)\s*$)|(```[\s\S]*?(?:```|$))|(`[^`\n]+`)|(!?\[[^\]]*\]\([^)]*\))|(\*\*[^*\n]+\*\*|_[^_\n]+_)/gm;

const CLASS: Record<Kind, string> = {
  heading: "text-[var(--ink)] font-semibold",
  link: "text-[var(--accent)]",
  code: "text-[var(--leaf)]",
  fence: "text-[var(--leaf)]",
  emphasis: "text-[var(--ink)]",
  bullet: "text-[var(--accent)]",
  quote: "text-[var(--ink-faint)] italic",
  rule: "text-[var(--ink-faint)]",
  plain: "",
};

/**
 * Lightweight markdown colouring for streamed output. Shiki runs on the server
 * and cannot highlight text that is still arriving, so this handles the few
 * constructs that matter in a scrape preview.
 */
export function MarkdownView({ value, className = "" }: { value: string; className?: string }) {
  const parts = useMemo(() => {
    const out: { text: string; kind: Kind }[] = [];
    let last = 0;
    for (const match of value.matchAll(TOKEN)) {
      const index = match.index ?? 0;
      if (index > last) out.push({ text: value.slice(last, index), kind: "plain" });
      const kind: Kind = match[1]
        ? "heading"
        : match[2]
          ? "bullet"
          : match[3]
            ? "quote"
            : match[4]
              ? "rule"
              : match[5]
                ? "fence"
                : match[6]
                  ? "code"
                  : match[7]
                    ? "link"
                    : "emphasis";
      out.push({ text: match[0], kind });
      last = index + match[0].length;
    }
    if (last < value.length) out.push({ text: value.slice(last), kind: "plain" });
    return out;
  }, [value]);

  return (
    <pre className={`mono whitespace-pre-wrap break-words text-[var(--ink-soft)] ${className}`}>
      {parts.map((part, i) => (
        <Fragment key={`${i}-${part.kind}`}>
          <span className={CLASS[part.kind]}>{part.text}</span>
        </Fragment>
      ))}
    </pre>
  );
}
