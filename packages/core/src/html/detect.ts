import type { Doc } from "./document.js";

const CHALLENGE_MARKERS = [
  "cf-browser-verification",
  "challenge-platform",
  "cf_chl_opt",
  "Just a moment...",
  "Attention Required! | Cloudflare",
  "_Incapsula_Resource",
  "px-captcha",
  "perimeterx",
  "datadome",
  "captcha-delivery.com",
  "Access Denied</title>",
  "g-recaptcha",
  "h-captcha",
  "awswaf",
  "kpsdk",
];

/** True when the response is an anti-bot interstitial rather than content. */
export function isBlocked(status: number, html: string): boolean {
  if (status === 401 || status === 407) return false;
  const head = html.length > 60_000 ? html.slice(0, 60_000) : html;
  const markers = CHALLENGE_MARKERS.some((m) => head.includes(m));
  if (status === 403 || status === 429 || status === 503) return true;
  return markers && head.length < 40_000;
}

const SPA_ROOTS = ["#root", "#app", "#__next", "#__nuxt", "#___gatsby", "#svelte", "[data-reactroot]", "app-root", "#main-app"];

/**
 * Heuristic: does this server-rendered HTML need a browser to be useful?
 * Runs in well under a millisecond on typical pages.
 */
export function needsJavaScript(doc: Doc, html: string): boolean {
  const body = doc.body;
  if (!body) return true;
  // textContent includes inline <script>/<style> bodies (often huge JSON state); exclude them.
  let hiddenLength = 0;
  for (const el of body.querySelectorAll("script, style, noscript, template")) hiddenLength += (el.textContent ?? "").length;
  const rawText = body.textContent ?? "";
  const visibleText = rawText.length - hiddenLength < 5_000 ? visibleTextOf(body) : rawText;
  const scripts = doc.querySelectorAll("script[src]").length;

  if (visibleText.length < 200 && scripts > 0) return true;

  // Interstitials that navigate client-side: meta refresh, auto-submitting forms, JS redirects.
  if (
    visibleText.length < 500 &&
    (doc.querySelector('meta[http-equiv="refresh" i], body[onload]') !== null ||
      /\b(?:window\.)?location(?:\.href)?\s*=|location\.replace\(|\.submit\(\)/.test(html.slice(0, 20_000)))
  ) {
    return true;
  }

  const noscript = doc.querySelector("noscript")?.textContent ?? "";
  if (/enable javascript|javascript is (required|disabled)|requires javascript/i.test(noscript) && visibleText.length < 1500) {
    return true;
  }

  for (const sel of SPA_ROOTS) {
    const root = doc.querySelector(sel);
    if (root && (root.textContent ?? "").trim().length < 100 && root.children.length <= 2) return true;
  }

  // Ratio of text to markup: a big bundle-heavy document with barely any text.
  return html.length > 50_000 && visibleText.length / html.length < 0.005;
}

function visibleTextOf(root: Element): string {
  let out = "";
  const walk = (node: Node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === 3) out += child.textContent;
      else if (child.nodeType === 1 && !/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test((child as Element).tagName)) walk(child);
    }
  };
  walk(root);
  return out.replace(/\s+/g, " ").trim();
}
