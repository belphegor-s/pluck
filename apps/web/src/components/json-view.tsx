"use client";

import { Fragment, useMemo } from "react";

const TOKEN =
  /("(?:\\.|[^"\\])*"\s*:)|("(?:\\.|[^"\\])*")|(\b-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|(\btrue\b|\bfalse\b|\bnull\b)/g;

/**
 * Small JSON colorizer for API responses. Shiki stays on the server; this is a
 * few hundred bytes and handles the one language the playground shows.
 */
export function JsonView({ value, className = "" }: { value: string; className?: string }) {
  const parts = useMemo(() => {
    const out: { text: string; kind: "plain" | "key" | "string" | "number" | "literal" }[] = [];
    let last = 0;
    for (const match of value.matchAll(TOKEN)) {
      const index = match.index ?? 0;
      if (index > last) out.push({ text: value.slice(last, index), kind: "plain" });
      const kind = match[1] ? "key" : match[2] ? "string" : match[3] ? "number" : "literal";
      out.push({ text: match[0], kind });
      last = index + match[0].length;
    }
    if (last < value.length) out.push({ text: value.slice(last), kind: "plain" });
    return out;
  }, [value]);

  const color = {
    plain: "text-[var(--ink-faint)]",
    key: "text-[var(--ink)]",
    string: "text-[var(--leaf)]",
    number: "text-[var(--accent)]",
    literal: "text-[var(--accent)]",
  } as const;

  return (
    <pre className={`mono whitespace-pre-wrap break-words ${className}`}>
      {parts.map((part, i) => (
        <Fragment key={`${i}-${part.kind}`}>
          <span className={color[part.kind]}>{part.text}</span>
        </Fragment>
      ))}
    </pre>
  );
}
