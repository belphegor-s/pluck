/**
 * Numbers are pinned to en-US grouping. `toLocaleString()` with no locale
 * follows whatever the server or browser is set to, so the same page rendered
 * 1,300,000 in one place and 13,00,000 in another.
 */
const numbers = new Intl.NumberFormat("en-US");

export const formatNumber = (value: number): string => numbers.format(value);

export const formatUsd = (value: number): string =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

const relative = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });

/** "3 minutes ago", "in 2 hours" — for timestamps where recency is the point. */
export function timeAgo(value: Date | string | null | undefined): string {
  if (!value) return "never";
  const date = typeof value === "string" ? new Date(value) : value;
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  }
  return Math.abs(seconds) < 10 ? "just now" : relative.format(seconds, "second");
}
