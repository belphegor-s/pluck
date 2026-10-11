import { capturePage } from "../lib/capture";
import { CONFIG } from "../lib/config";
import { completeConnect } from "../lib/connect";
import { newId } from "../lib/format";
import { describeTab } from "../lib/page";
import { setIntent, setTarget } from "../lib/storage";
import type { Intent } from "../lib/types";

/**
 * The service worker. It holds no state and does no work of its own: it turns
 * the ways someone can invoke Pluck (toolbar button, shortcut, right-click)
 * into "open the panel on this tab", and it finishes sign-in when the site's
 * connect page calls back. Everything else happens in the side panel.
 */

const SITE_ORIGIN = new URL(CONFIG.siteUrl).origin;
const MENU = { page: "pluck-page", link: "pluck-link", selection: "pluck-selection" } as const;
/** A selection larger than this is almost certainly the whole page; cut it. */
const MAX_SELECTION_CHARS = 1_500_000;

chrome.runtime.onInstalled.addListener(({ reason }) => {
  // Menus persist across worker restarts, so they are created once per install or update.
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU.page,
      title: chrome.i18n.getMessage("menuPage"),
      contexts: ["page"],
    });
    chrome.contextMenus.create({
      id: MENU.link,
      title: chrome.i18n.getMessage("menuLink"),
      contexts: ["link"],
    });
    chrome.contextMenus.create({
      id: MENU.selection,
      title: chrome.i18n.getMessage("menuSelection"),
      contexts: ["selection"],
    });
  });
  if (reason === chrome.runtime.OnInstalledReason.INSTALL)
    void chrome.tabs.create({ url: chrome.runtime.getURL("options.html?welcome=1") });
});

/**
 * Opens the panel in the tab's window and points it at the tab.
 *
 * `sidePanel.open` only works while the browser still counts this as the
 * person's own action, so it is called before anything is awaited. Being
 * invoked is also what grants `activeTab`, which is why the tab's address is
 * readable here and nowhere else.
 */
function openOn(tab: chrome.tabs.Tab, intent?: () => Promise<Intent | null>): void {
  if (tab.windowId === undefined) return;
  const windowId = tab.windowId;
  void chrome.sidePanel.open({ windowId }).catch(() => {});
  void (async () => {
    await setTarget(windowId, describeTab(tab));
    const next = await intent?.();
    if (next) await setIntent(windowId, next);
  })();
}

chrome.action.onClicked.addListener((tab) => openOn(tab));

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "pluck-markdown" && tab)
    openOn(tab, async () => ({ id: newId(), tool: "markdown", run: true }));
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab) return;
  if (info.menuItemId === MENU.page)
    openOn(tab, async () => ({ id: newId(), tool: "markdown", run: true }));
  else if (info.menuItemId === MENU.link && info.linkUrl) {
    const url = info.linkUrl;
    openOn(tab, async () => ({ id: newId(), tool: "markdown", run: true, url }));
  } else if (info.menuItemId === MENU.selection && tab.id !== undefined) {
    const tabId = tab.id;
    openOn(tab, async () => {
      // The selection is read now, while it still exists; the panel may take a
      // moment to open and a click elsewhere would lose it.
      const [frame] = await chrome.scripting
        .executeScript({
          target: { tabId, frameIds: info.frameId ? [info.frameId] : undefined },
          func: capturePage,
          args: ["selection", MAX_SELECTION_CHARS],
        })
        .catch(() => []);
      const selection = frame?.result ?? plainSelection(info.selectionText, tab);
      if (!selection) return null;
      return { id: newId(), tool: "markdown", run: true, selection };
    });
  }
});

/**
 * When the frame holding the selection cannot be read (a cross-origin frame,
 * a PDF), the browser still reports the selected text: use that, as paragraphs.
 */
function plainSelection(text: string | undefined, tab: chrome.tabs.Tab) {
  if (!text?.trim()) return null;
  const escapeHtml = (value: string) =>
    value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const paragraphs = text
    .split(/\n{2,}/)
    .map((part) => `<p>${escapeHtml(part.trim())}</p>`)
    .join("");
  return {
    html: `<!doctype html><html><head><meta charset="utf-8"></head><body>${paragraphs}</body></html>`,
    title: tab.title ?? "",
    url: tab.url ?? "",
    truncated: false,
  };
}

/**
 * Sign-in callback from the site's connect page.
 *
 * `externally_connectable` already limits who can send here to the site, and
 * the origin is checked again rather than trusted. A code only completes a
 * sign-in this browser itself started: `completeConnect` matches it to the
 * pending request and its verifier.
 */
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (sender.origin !== SITE_ORIGIN) return false;
  const type = (message as { type?: unknown } | null)?.type;

  if (type === CONFIG.message.ping) {
    sendResponse({ ok: true, version: CONFIG.version });
    return false;
  }
  if (type !== CONFIG.message.connect) return false;

  const { code, state } = message as { code?: unknown; state?: unknown };
  completeConnect(code, state).then(
    ({ returnTabId }) => {
      sendResponse({ ok: true });
      // Let the page show its confirmation, then put the person back where they were.
      const connectTabId = sender.tab?.id;
      setTimeout(() => {
        if (returnTabId !== undefined)
          void chrome.tabs.update(returnTabId, { active: true }).catch(() => {});
        if (connectTabId !== undefined) void chrome.tabs.remove(connectTabId).catch(() => {});
      }, 1600);
    },
    (err: unknown) =>
      sendResponse({
        ok: false,
        error: err instanceof Error ? err.message : "Sign-in could not be completed.",
      }),
  );
  // Keeps the channel open for the asynchronous reply.
  return true;
});
