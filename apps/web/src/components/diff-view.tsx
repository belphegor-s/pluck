/**
 * A unified diff, coloured by line.
 *
 * Monitor diffs are unified format from the worker. File headers and hunk
 * markers are kept but quiet, because the lines that changed are what anyone
 * opening a change wants to read.
 */
export function DiffView({ diff, className = "" }: { diff: string; className?: string }) {
  const lines = diff.split("\n").filter((line) => !/^(=+|Index:)/.test(line));
  return (
    <pre className={`mono overflow-x-auto whitespace-pre text-xs leading-relaxed ${className}`}>
      {lines.map((line, i) => {
        const kind = /^(\+\+\+|---)/.test(line)
          ? "meta"
          : line.startsWith("@@")
            ? "hunk"
            : line.startsWith("+")
              ? "add"
              : line.startsWith("-")
                ? "remove"
                : "same";
        return (
          // Lines are positional and never reordered, so the index is stable.
          <span key={i} className={`block px-3 ${STYLE[kind]}`}>
            {line || " "}
          </span>
        );
      })}
    </pre>
  );
}

const STYLE = {
  meta: "text-[var(--ink-faint)]",
  hunk: "text-[var(--ink-faint)] bg-[color-mix(in_srgb,var(--line)_40%,transparent)]",
  add: "text-[var(--leaf)] bg-[color-mix(in_srgb,var(--leaf)_10%,transparent)]",
  remove: "text-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]",
  same: "text-[var(--ink-soft)]",
} as const;
