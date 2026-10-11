# Chrome Web Store listing

Everything the developer dashboard asks for, in the order it asks. Copy from here; when something changes, change it here first so the listing and the repository never disagree.

Images are not committed. `pnpm --filter @pluck/extension store` renders them into `store/out/` from the real panel, so they always match the build.

## Store listing

**Title** (comes from `static/_locales/en/messages.json`, `extName`)

```
Pluck: any web page as markdown for AI
```

**Summary** (comes from `extDescription`; 132 characters at most, the build fails if it is longer)

```
Turn the page you are on into clean markdown, structured JSON, brand data or a screenshot, ready to paste into any AI model.
```

**Description**

```
Pluck turns the page in front of you into what a prompt needs, instead of raw HTML.

Click the Pluck button and a side panel opens next to the page. One more click gives you the page as clean markdown: no menus, cookie banners or scripts, with a copy button and an estimate of how many tokens it is. Paste it into any AI chat, coding assistant or your own code.

SEVEN TOOLS IN ONE PANEL

- Markdown: any page as clean, LLM-ready markdown.
- Extract: describe the data you want in a sentence and get JSON back. Give it a JSON Schema and the answer is validated against it.
- Brand: logos, colors, fonts, social profiles and industry for the site you are on, or any domain.
- Styleguide: the design tokens a page is really built from, as JSON or CSS variables.
- Map: every URL on a site, from its sitemaps and links.
- Screenshot: a clean capture of the page, full length if you like.
- Search: web or news results as a markdown list.

Every result can be copied or saved as a file, and your recent results stay on your device so you can copy them again.

WORKS ON PAGES BEHIND A SIGN-IN

Most tools fetch the page from our servers, which gives the cleanest result for anything public. For a dashboard, a paywalled article you subscribe to, or a local development server, choose "This tab as I see it": Pluck reads the page that is on your screen instead. Hidden elements are left out, and anything typed into a form field is never sent.

PRIVATE BY DESIGN

- Pluck does nothing until you click. It reads one tab, the one you opened it on, and only when you run a tool.
- No permission warning at install: the extension has no standing access to any website.
- No analytics, no ads, no browsing history, no content scripts running in your pages.
- Your API key and results are stored on your device. Signing out revokes the key.
- Open source (AGPL-3.0). Read every line: https://github.com/belphegor-s/pluck

FAST TO START

Right-click any page, link or selection and choose "Pluck as markdown", or use the shortcuts: Alt+Shift+P opens the panel, Alt+Shift+M plucks the page straight away.

You can preview Pluck on any public page before creating an account. A free account comes with 1,000 credits and needs no card; a page as markdown costs 1 credit. After that credits are pay as you go and never expire. There is no subscription.

SELF-HOSTED

Pluck is the same open-source software whether we run it or you do. Point the extension at your own instance in settings and nothing leaves your server.

Docs: https://pluck.procd.cc/docs/extension
Privacy: https://pluck.procd.cc/legal/privacy
Questions: hello@pluck.procd.cc
```

**Category**: Developer Tools

**Language**: English

**Graphic assets** (from `store/out/`)

| Field | File | Size |
| --- | --- | --- |
| Store icon | `icon-128.png` | 128x128 |
| Screenshot 1 | `screenshot-1-markdown.png` | 1280x800 |
| Screenshot 2 | `screenshot-2-tools.png` | 1280x800 |
| Screenshot 3 | `screenshot-3-extract.png` | 1280x800 |
| Screenshot 4 | `screenshot-4-brand.png` | 1280x800 |
| Screenshot 5 | `screenshot-5-private.png` | 1280x800 |
| Small promo tile | `promo-small-440x280.png` | 440x280 |
| Marquee promo tile | `promo-marquee-1400x560.png` | 1400x560 |

The site shown in the screenshots, Northwind Roasters, is invented for them. No real brand appears.

**Additional fields**

| Field | Value |
| --- | --- |
| Official URL | `pluck.procd.cc` (verify the domain in Search Console first) |
| Homepage URL | `https://pluck.procd.cc/extension` |
| Support URL | `https://github.com/belphegor-s/pluck/issues` |
| Mature content | No |

## Privacy practices

**Single purpose**

```
Pluck converts the web page the user is viewing into AI-ready data (markdown, structured JSON, brand data, design tokens, a site map or a screenshot) using the Pluck API, when the user asks for it from the side panel.
```

**Permission justifications**

| Permission | Justification |
| --- | --- |
| `activeTab` | When the user clicks the toolbar button, uses a keyboard shortcut or picks a context menu entry, the extension reads the address and title of that one tab so it can show which page a tool will run on and send that address to the Pluck API. No other tab is accessed. |
| `scripting` | Used only for the "This tab as I see it" option and the "Pluck the selection" menu entry: a function is injected into the active tab, on the user's request, to read the visible page content (form fields excluded) so it can be converted to markdown. No script is injected at any other time and there are no content scripts. |
| `sidePanel` | The extension's whole interface is a side panel, so results stay next to the page they came from. |
| `storage` | Stores the user's Pluck API key, their settings and their 25 most recent results locally on the device. Nothing is synced. |
| `contextMenus` | Adds three entries: pluck this page, this link, or the current selection as markdown. |
| `tabs` (optional) | Requested only if the user turns on "Follow the tab I am looking at" in settings. It lets the side panel show the page in the active tab as the user switches tabs, instead of requiring a click on each one. The address is used only to display it and to run a tool the user starts. |

**Host permissions**: none requested.

**Remote code**: No, I am not using remote code. All JavaScript is in the package; the content security policy is `script-src 'self'`.

**Data usage** (tick these, and nothing else)

| Data type | Collected | Why |
| --- | --- | --- |
| Website content | Yes | The address of the page, and for "This tab as I see it" its visible content, is sent to the Pluck API when the user runs a tool, to produce the result. |
| Web history | Yes | Only in the narrow sense the form uses: the address of a page the user explicitly runs a tool on is sent to the API and appears in their account's usage log. No list of visited pages is collected. |
| Authentication information | Yes | The user's Pluck API key is stored on the device and sent to the Pluck API to authorise their own requests. |
| Personally identifiable information | No | |
| Health, financial, personal communications, location, user activity | No | |

**Certifications** (all three apply)

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL**: `https://pluck.procd.cc/legal/privacy` (it has a "Browser extension" section)

## Distribution

| Field | Value |
| --- | --- |
| Visibility | Public |
| Regions | All regions |
| Payments | Free to install. Credits are bought on the website, not through the store. |

## Test instructions for the reviewer

Sign-in on the site is GitHub only, which a reviewer cannot use, so give them a key instead. Create a key named `Chrome Web Store review` in the dashboard of a workspace with a few hundred credits, and paste the text below into the dashboard's "Test instructions" field with the key filled in. Never commit the key. Revoke it once the review is done.

```
No account is needed to try the basic function: open any public article, click the Pluck toolbar button, and choose "Preview this page as markdown".

To test every tool, use this test key instead of signing in (sign-in is GitHub only):
1. Right-click the Pluck toolbar button and choose Options.
2. Under "Your own instance", enter API address: https://pluck-api.procd.cc
3. Enter API key: <PASTE THE REVIEW KEY HERE>
4. Click "Check and save".
5. Open any public web page, click the Pluck toolbar button, and pick a tool from the side panel.

"This tab as I see it" (under Markdown) is the only feature that reads page content from the tab; it runs only when the user clicks "Pluck as markdown" with that option selected.
```

## Releasing

### The first time

1. `pnpm --filter @pluck/extension package` writes `release/pluck-extension-<version>.zip`.
2. In the [developer dashboard](https://chrome.google.com/webstore/devconsole), create a new item and upload the zip. The draft now has an item id (32 letters).
3. Put that id in `chromeExtensionId` in `packages/shared/src/identity.ts` and deploy the web app. **Do this before submitting.** The site's connect page refuses extension ids it does not know, so until it is deployed nobody, the reviewer included, can sign in from the store build. (`CHROME_EXTENSION_IDS` on the web app does the same without a deploy, but the "Add to Chrome" button on `/extension` only appears once the id is in `identity.ts`.)
4. `pnpm --filter @pluck/extension store` renders the images. Upload them.
5. Fill in the listing, privacy and distribution tabs from this file, and the test instructions with a fresh review key.
6. Submit for review.

### Every release after

1. Bump `version` in `apps/extension/package.json`. The manifest takes its version from there.
2. `pnpm --filter @pluck/extension test` and `pnpm --filter @pluck/extension e2e`.
3. `pnpm --filter @pluck/extension package`, upload the zip, describe what changed, submit.
4. If the UI changed, run `pnpm --filter @pluck/extension store` and replace the images.

A new permission in the manifest disables the extension for existing users until they accept it. Avoid adding one; prefer an optional permission asked for at the moment it is needed, as `tabs` is.

### Other stores

The same zip works for Microsoft Edge Add-ons. Edge assigns its own id: add it to `CHROME_EXTENSION_IDS` on the web app so sign-in works there too.
