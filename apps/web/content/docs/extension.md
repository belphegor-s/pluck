# Browser extension

Pluck for Chrome puts the API in a side panel next to the page you are reading. One click turns the tab in front of you into markdown, structured JSON, brand data, design tokens, a site map or a screenshot, without writing a request.

It runs in Chrome, Edge and other Chromium browsers that have a side panel (version 116 or newer).

## Install and connect

1. Install the extension and pin it to the toolbar.
2. Open it and choose **Connect your account**. A tab opens on this site: sign in, or create an account, pick the workspace to use and approve.
3. The tab closes and the panel is ready.

Accounts are only ever created here on the site. The extension never sees your GitHub sign-in or a session cookie: connecting gives it an API key of its own, named `Chrome extension (Windows 4f2a)` or similar, which shows up under **API keys** in the dashboard like any other key. What you run in the extension spends that workspace's credits at the normal API prices.

To disconnect, open the extension's settings and choose **Sign out and revoke this key**, or revoke the key from the dashboard.

## Pointing it at a page

The extension can only see a tab once you have opened it there. Any of these does that:

| How | What happens |
| --- | --- |
| Click the toolbar button | Opens the panel on this tab |
| `Alt+Shift+P` | The same, from the keyboard |
| `Alt+Shift+M` | Opens the panel and plucks the page as markdown straight away |
| Right-click the page | **Pluck this page as markdown** |
| Right-click a link | **Pluck this link as markdown**, without opening it |
| Right-click selected text | **Pluck the selection as markdown** |

Switch to another tab and the panel asks you to click the button again. If you would rather it kept up by itself, turn on **Follow the tab I am looking at** in settings; the browser will ask for permission to see the address and title of your tabs. Shortcuts can be changed at `chrome://extensions/shortcuts`.

## The tools

| Tool | What you get | Endpoint |
| --- | --- | --- |
| Markdown | The page as clean markdown, with an approximate token count | `/v1/scrape` or `/v1/parse` |
| Extract | JSON matching a prompt, a JSON Schema, or both | `/v1/extract` |
| Brand | Logos, colors, fonts, socials and industry for a domain | `/v1/brand` |
| Styleguide | Palette, typefaces, type scale and radii, as JSON or CSS variables | `/v1/styleguide` |
| Map | Every URL on the site, filterable | `/v1/map` |
| Screenshot | A clean capture, full page if you like | `/v1/screenshot` |
| Search | Web or news results as a markdown list | `/v1/search` |

Every result can be copied or saved as a file, and the last 25 are kept on your device under **Recent** so you can copy them again.

## Two ways to read a page

**Fetch the page** sends only the address. Pluck fetches it from the internet, renders JavaScript when the page needs it and strips the navigation, exactly as `/v1/scrape` does. Use it for anything public.

**This tab as I see it** is for pages only your browser can reach: something behind a sign-in, a paywalled article you are subscribed to, a local development server. The extension reads the page that is on your screen and sends its visible content to `/v1/parse` for conversion. Before anything is sent:

- form fields, text areas and buttons are removed, so nothing you typed leaves the page;
- elements that are hidden on screen are removed;
- scripts, styles, frames and nearly all attributes are dropped.

The extension chooses this mode by itself for `localhost` and private addresses, which the API could not reach anyway.

## Permissions and privacy

Installing the extension shows no permission warning, because it asks for no standing access to any site.

| Permission | Why |
| --- | --- |
| `activeTab` | To see the one tab you opened the extension on |
| `scripting` | To read that tab when you choose "this tab as I see it" |
| `sidePanel` | The panel itself |
| `storage` | Your API key, settings and recent results, kept on your device |
| `contextMenus` | The right-click entries |
| `tabs` (optional) | Only if you turn on "follow the tab I am looking at" |

The extension does nothing until you ask it to. It has no analytics, no content script running in your pages and no browsing history. The only network requests it makes are the calls you start (the preview before you connect included), a balance check when the panel opens, and the sign-in and sign-out exchanges with this site. The [privacy policy](/legal/privacy) covers what the API stores.

## With your own instance

The extension works with a self-hosted Pluck. Open its settings, and under **Your own instance** enter the address of your API and an API key (`BOOTSTRAP_API_KEY` on a fresh stack). The key is checked against `/v1/usage` and then stored in the browser. From then on every request goes to your server and nowhere else.

If your instance also runs the dashboard with GitHub sign-in and you want the one-click **Connect** flow, build the extension against it and allow that build's id:

```bash
PLUCK_SITE_URL=https://pluck.example.com \
PLUCK_API_URL=https://pluck-api.example.com \
pnpm --filter @pluck/extension build
```

Load `apps/extension/dist` as an unpacked extension, copy its id from `chrome://extensions`, and set `CHROME_EXTENSION_IDS=<that id>` on the web app. The connect page refuses any extension id it has not been told about.

## Troubleshooting

**"Pluck is not open on this tab."** Click the toolbar button or press `Alt+Shift+P` on the tab you want. The browser only lets the extension see a tab you have opened it on.

**"The browser keeps this page private."** Browser pages such as `chrome://` addresses, the extension store and the built-in PDF viewer cannot be read by any extension. Fetching the address instead often still works.

**"The page could not be fetched."** The site blocked the request or needs a sign-in. Choose **Read the tab as I see it instead**.

**"This key no longer works."** The key was revoked in the dashboard, or its creator left the workspace. Connect again to get a new one.

**"The extension did not answer" on the connect page.** The extension is not installed in this browser profile, or was just updated. Reload the page, or start again from the extension.
