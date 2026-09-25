#!/usr/bin/env node
/**
 * House style: copy fills the space it is given. Text is never wrapped to a
 * reading width (max-w-[65ch], max-w-prose, a narrow max-w-md around a
 * paragraph, `max-width: 68ch` in CSS); readability comes from the type
 * scale in globals.css instead. Runs in `pnpm lint`, so CI fails on any
 * tracked web file that brings one back.
 *
 * The site container (max-w-6xl) is allowed, as are the few pages that are a
 * single form rather than copy, listed in ALLOW below. Table cells cap in rem
 * so long URLs truncate; that is data, not copy, and is not matched.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// The lookahead, not \b, ends the match: `]` then `"` has no word boundary.
const NARROW = /\bmax-w-(?:\[[\d.]+ch\]|prose|xs|sm|md|lg|xl|2xl|3xl|4xl|5xl)(?![\w-])/;
const CSS_MEASURE = /max-width:\s*[\d.]+ch\b/;

/** Pages that are one centred form, where a narrow column is the design. */
const ALLOW = {
  "apps/web/src/app/login/page.tsx": ["max-w-md"],
  "apps/web/src/app/invite/[token]/page.tsx": ["max-w-lg"],
  "apps/web/src/app/onboarding/page.tsx": ["max-w-lg"],
};

const files = execFileSync("git", ["ls-files", "apps/web/src"], { encoding: "utf8" })
  .split("\n")
  .filter((f) => /\.(tsx|ts|css)$/.test(f));

const problems = [];
for (const file of files) {
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    const hit =
      NARROW.exec(line)?.[0] ?? (file.endsWith(".css") ? CSS_MEASURE.exec(line)?.[0] : null);
    if (!hit || ALLOW[file]?.includes(hit)) return;
    problems.push(`${file}:${i + 1}: ${hit}`);
  });
}

if (problems.length) {
  console.error(
    `Copy must use the full width available; remove these reading-width caps:\n${problems.join("\n")}`,
  );
  process.exit(1);
}
