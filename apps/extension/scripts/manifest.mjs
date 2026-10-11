/**
 * The extension manifest, built rather than hand-written so the version, the
 * site it signs in through and the product name always match the rest of the
 * monorepo.
 *
 * Permissions are deliberately the smallest set that works, and none of them
 * shows a warning at install:
 *
 *   activeTab     read the tab the person invoked Pluck on, and nothing else
 *   scripting     run the page reader in that tab ("this tab as I see it")
 *   sidePanel     the UI
 *   storage       the API key, settings and recent results, on this device
 *   contextMenus  the right-click entries
 *
 * `tabs` is optional and only requested if someone turns on "follow the tab I
 * am looking at". There are no host permissions: the API and the site answer
 * the extension's origin with CORS headers instead.
 */

/** A match pattern for one origin. Patterns cannot carry a port, so it is dropped. */
const originPattern = (url) => {
  const { protocol, hostname } = new URL(url);
  return `${protocol}//${hostname}/*`;
};

export function buildManifest({ version, siteUrl, dev, devKey }) {
  return {
    manifest_version: 3,
    name: "__MSG_extName__",
    short_name: "__MSG_extShortName__",
    description: "__MSG_extDescription__",
    version,
    default_locale: "en",
    // sidePanel.open() arrived in Chrome 116.
    minimum_chrome_version: "116",
    homepage_url: new URL("/extension", siteUrl).href,
    icons: {
      16: "icons/icon-16.png",
      32: "icons/icon-32.png",
      48: "icons/icon-48.png",
      128: "icons/icon-128.png",
    },
    action: {
      default_title: "__MSG_actionTitle__",
      default_icon: { 16: "icons/icon-16.png", 32: "icons/icon-32.png", 48: "icons/icon-48.png" },
    },
    background: { service_worker: "background.js" },
    side_panel: { default_path: "panel.html" },
    options_ui: { page: "options.html", open_in_tab: true },
    permissions: ["activeTab", "scripting", "sidePanel", "storage", "contextMenus"],
    optional_permissions: ["tabs"],
    // Only the site's connect page may message the extension, to finish sign-in.
    externally_connectable: { matches: [originPattern(siteUrl)] },
    commands: {
      _execute_action: {
        suggested_key: { default: "Alt+Shift+P" },
        description: "__MSG_commandOpen__",
      },
      "pluck-markdown": {
        suggested_key: { default: "Alt+Shift+M" },
        description: "__MSG_commandMarkdown__",
      },
    },
    content_security_policy: {
      // No remote code, no inline script, no eval. connect-src stays open
      // because a self-hosted instance can live at any address, plain http
      // on a LAN included.
      extension_pages:
        "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data: blob: https: http:; connect-src https: http:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    },
    ...(dev ? { key: devKey } : {}),
  };
}
