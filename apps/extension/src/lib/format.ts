const numbers = new Intl.NumberFormat("en-US");

export const formatNumber = (value: number): string => numbers.format(value);

export const plural = (count: number, noun: string): string =>
  `${formatNumber(count)} ${noun}${count === 1 ? "" : "s"}`;

/** "840 ms", "3.2 s". */
export const formatDuration = (ms: number): string =>
  ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;

/** A rough token count: about four characters each for English prose. */
export const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

const relative = new Intl.RelativeTimeFormat("en-US", { numeric: "auto", style: "narrow" });

export function timeAgo(at: number): string {
  const seconds = Math.round((at - Date.now()) / 1000);
  for (const [unit, size] of [
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ] as const)
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  return "now";
}

/** A file name from a page title or host: lowercase words joined by hyphens. */
export function slugify(text: string, fallback = "page"): string {
  const slug = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return slug || fallback;
}

export function downloadText(text: string, filename: string, mime: string): void {
  downloadBlob(new Blob([text], { type: `${mime};charset=utf-8` }), filename);
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export const newId = (): string => crypto.randomUUID();
