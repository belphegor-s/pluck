import { createHash } from "node:crypto";
import { createTwoFilesPatch, diffLines } from "diff";

export const sha256 = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");

export interface TextChange {
  diff: string;
  added: number;
  removed: number;
  summary: string;
}

/** Unified diff with a short human summary; `null` when content is unchanged. */
export function diffText(before: string, after: string, label = "content"): TextChange | null {
  if (before === after) return null;
  let added = 0;
  let removed = 0;
  for (const part of diffLines(before, after)) {
    if (part.added) added += part.count ?? 0;
    if (part.removed) removed += part.count ?? 0;
  }
  if (added === 0 && removed === 0) return null;
  const diff = createTwoFilesPatch(`a/${label}`, `b/${label}`, before, after, "", "", {
    context: 2,
  });
  return {
    diff: diff.length > 200_000 ? `${diff.slice(0, 200_000)}\n... (truncated)` : diff,
    added,
    removed,
    summary: `${added} line(s) added, ${removed} removed`,
  };
}

export function diffSets(before: string[], after: string[]) {
  const prev = new Set(before);
  const next = new Set(after);
  return {
    added: after.filter((u) => !prev.has(u)),
    removed: before.filter((u) => !next.has(u)),
  };
}
