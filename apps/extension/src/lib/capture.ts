export interface Captured {
  html: string;
  title: string;
  url: string;
  /** The page was larger than the limit and was cut. */
  truncated: boolean;
}

export type CaptureMode = "main" | "page" | "selection";

/**
 * Reads the page the way the person sees it and returns tidy HTML for the API
 * to turn into markdown. It runs inside the tab, injected on demand with
 * `chrome.scripting.executeScript`, never as a standing content script.
 *
 * IMPORTANT: this function is serialised and re-created in the page, so it
 * must not use anything from outside its own body: no imports, no helpers
 * declared elsewhere in this file.
 *
 * What is sent is deliberately less than what is on screen:
 *  - form controls are removed, so nothing typed into a field leaves the page;
 *  - hidden elements are removed, so text the person cannot see is not sent;
 *  - scripts, styles, frames and most attributes are dropped as noise.
 *
 * Returns null when there is nothing to read (an empty selection).
 */
export function capturePage(mode: CaptureMode, maxChars: number): Captured | null {
  const NOISE =
    "script,style,noscript,template,iframe,frame,frameset,object,embed,canvas,svg,link,meta,base,audio,video,dialog:not([open]),input,textarea,select,option,button,[hidden],[aria-hidden='true']";
  const FURNITURE =
    "nav,aside,[role='navigation'],[role='complementary'],[role='search'],[role='banner'],[role='contentinfo']";
  const KEEP = new Set([
    "href",
    "src",
    "alt",
    "title",
    "colspan",
    "rowspan",
    "start",
    "datetime",
    "lang",
  ]);

  const absolute = (value: string | null): string | null => {
    if (!value) return null;
    try {
      const url = new URL(value, document.baseURI);
      return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
    } catch {
      return null;
    }
  };

  /** No box and not `display: contents` means the person cannot see it. */
  const invisible = (el: Element): boolean => {
    if (typeof el.checkVisibility !== "function") return false;
    if (el.checkVisibility({ visibilityProperty: true })) return false;
    return getComputedStyle(el).display !== "contents";
  };

  const tidy = (root: Element): void => {
    for (const el of root.querySelectorAll(NOISE)) el.remove();
    for (const el of root.querySelectorAll("*")) {
      if (el instanceof HTMLImageElement) {
        const lazy = el.getAttribute("src") ? null : el.getAttribute("data-src");
        const src = absolute(lazy ?? el.getAttribute("src"));
        if (src) el.setAttribute("src", src);
        else el.removeAttribute("src");
      } else if (el instanceof HTMLAnchorElement) {
        const href = absolute(el.getAttribute("href"));
        if (href) el.setAttribute("href", href);
        else el.removeAttribute("href");
      }
      // Code blocks say their language in the class; everything else is styling.
      const keepClass = el.tagName === "CODE" || el.tagName === "PRE";
      for (const name of el.getAttributeNames())
        if (!KEEP.has(name) && !(keepClass && name === "class")) el.removeAttribute(name);
    }
  };

  let holder: Element;

  if (mode === "selection") {
    const selection = getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
    holder = document.createElement("div");
    for (let i = 0; i < selection.rangeCount; i++)
      holder.append(selection.getRangeAt(i).cloneContents());
  } else {
    let source: Element = document.body;
    if (mode === "main") {
      // The largest landmark, when it holds a real share of the page's text.
      const total = document.body.textContent?.length ?? 0;
      let best: Element | null = null;
      let bestLength = 0;
      for (const el of document.querySelectorAll("main,[role='main'],article")) {
        const length = el.textContent?.length ?? 0;
        if (length > bestLength) {
          best = el;
          bestLength = length;
        }
      }
      if (best && bestLength > 200 && bestLength > total * 0.25) source = best;
    }

    holder = source.cloneNode(true) as Element;
    // The clone has the same shape as the original, so walking both in step
    // lets visibility be read from the live page and applied to the copy.
    const live = document.createTreeWalker(source, NodeFilter.SHOW_ELEMENT);
    const copy = document.createTreeWalker(holder, NodeFilter.SHOW_ELEMENT);
    const unseen: Element[] = [];
    let visited = 0;
    while (live.nextNode() && copy.nextNode() && visited++ < 20_000)
      if (invisible(live.currentNode as Element)) unseen.push(copy.currentNode as Element);
    for (const el of unseen) el.remove();

    if (mode === "main") {
      for (const el of holder.querySelectorAll(FURNITURE)) el.remove();
      // With no landmark to narrow to, the page's own header and footer go too.
      if (source === document.body)
        for (const el of holder.querySelectorAll(":scope > header, :scope > footer")) el.remove();
    }
  }

  tidy(holder);
  if (!holder.textContent?.trim() && !holder.querySelector("img")) return null;

  const escapeHtml = (text: string) =>
    text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const body = holder.innerHTML;
  const truncated = body.length > maxChars;
  const lang = document.documentElement.lang.replace(/[^\w-]/g, "");
  const html = `<!doctype html><html${lang ? ` lang="${lang}"` : ""}><head><meta charset="utf-8"><title>${escapeHtml(document.title)}</title></head><body>${truncated ? body.slice(0, maxChars) : body}</body></html>`;

  return { html, title: document.title, url: location.href, truncated };
}
