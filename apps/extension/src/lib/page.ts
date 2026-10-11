import { type Captured, type CaptureMode, capturePage } from "./capture";
import type { Target } from "./types";

/** About 6 MB of HTML: far beyond any article, and well inside the API's limit. */
const MAX_CAPTURE_CHARS = 6_000_000;

export const describeTab = (tab: chrome.tabs.Tab): Target => ({
  tabId: tab.id ?? chrome.tabs.TAB_ID_NONE,
  url: tab.url ?? null,
  title: tab.title ?? "",
  favicon: tab.favIconUrl ?? null,
});

export type Reach =
  /** An ordinary public page: the API can fetch it. */
  | "public"
  /** A page only this browser can reach: localhost or a private address. */
  | "local"
  /** A browser page, a file or anything else that is not on the web. */
  | "none";

/** Whether the API could fetch a URL itself, judged from the address alone. */
export function reachOf(url: string | null): Reach {
  if (!url) return "none";
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "none";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "none";
  const host = parsed.hostname;
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) ||
    host === "[::1]" ||
    !host.includes(".")
  )
    return "local";
  return "public";
}

export const hostOf = (url: string | null): string => {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, "") : "";
  } catch {
    return "";
  }
};

/** A URL shortened for display: host and path, no scheme, no query noise. */
export function displayUrl(url: string | null): string {
  if (!url) return "";
  try {
    const { hostname, pathname } = new URL(url);
    return hostname.replace(/^www\./, "") + (pathname === "/" ? "" : pathname);
  } catch {
    return url;
  }
}

export class CaptureError extends Error {
  constructor(
    /**
     * `access`: the extension has not been invoked on this tab.
     * `restricted`: the browser never lets extensions read this page.
     * `empty`: nothing readable was found.
     */
    readonly reason: "access" | "restricted" | "empty",
  ) {
    super(reason);
    this.name = "CaptureError";
  }
}

/** Runs the page reader in a tab. Needs the tab to have been invoked on (activeTab). */
export async function captureTab(tabId: number, mode: CaptureMode): Promise<Captured> {
  let results: chrome.scripting.InjectionResult<Captured | null>[];
  try {
    results = await chrome.scripting.executeScript({
      target: { tabId },
      func: capturePage,
      args: [mode, MAX_CAPTURE_CHARS],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    throw new CaptureError(
      /chrome:\/\/|edge:\/\/|gallery|cannot be scripted|webstore|view-source|about:/i.test(message)
        ? "restricted"
        : "access",
    );
  }
  const captured = results[0]?.result;
  if (!captured) throw new CaptureError("empty");
  return captured;
}
