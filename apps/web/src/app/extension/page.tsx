import { BRAND, credits, SIGNUP_GRANT } from "@pluck/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { formatNumber } from "@/lib/format";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Browser extension",
  description: `${SITE.name} for Chrome turns the page you are on into clean markdown, structured JSON, brand data or a screenshot, ready to paste into any AI model.`,
  alternates: { canonical: "/extension" },
};

/** Empty until the Chrome Web Store has assigned the listing its id. */
const STORE_URL = BRAND.chromeExtensionId
  ? `https://chromewebstore.google.com/detail/${BRAND.chromeExtensionId}`
  : null;
const SOURCE_URL = `${SITE.repo}/tree/main/apps/extension`;

const credit = (count: number) => `${count} credit${count === 1 ? "" : "s"}`;

const tools = [
  {
    name: "Markdown",
    cost: `from ${credit(credits.scrape)}`,
    text: "The page as clean markdown, without the menus, banners and scripts. Copy it, save it, or see roughly how many tokens it is.",
  },
  {
    name: "Extract",
    cost: credit(credits.scrape + credits.llm),
    text: "Say what you want in a sentence and get JSON back. Hand it a JSON Schema and the answer is checked against it first.",
  },
  {
    name: "Brand",
    cost: credit(credits.brand),
    text: "Logos, colors, fonts, socials and industry for the site you are on, or any domain you type.",
  },
  {
    name: "Styleguide",
    cost: credit(credits.styleguide),
    text: "The design tokens a page is really built from: palette, typefaces, type scale and radii, as JSON or CSS variables.",
  },
  {
    name: "Map",
    cost: credit(credits.map),
    text: "Every URL on the site, from its sitemaps and links, with a filter and one-click copy.",
  },
  {
    name: "Screenshot",
    cost: credit(credits.scrape + credits.browserRender + credits.screenshot),
    text: "A clean capture from our browser, full length if you like, with ads blocked.",
  },
  {
    name: "Search",
    cost: credit(credits.search),
    text: "Web or news results as a markdown list you can hand straight to a model.",
  },
];

const permissions = [
  [
    "The tab you open it on",
    "Clicking the toolbar button, using a shortcut or a right-click entry lets the extension see that one tab. It cannot see the others, and it has no access to any site in the background.",
  ],
  ["The side panel", "Where the extension lives, so a result stays next to the page it came from."],
  [
    "Storage on your device",
    "Your API key, settings and the last 25 results. Nothing is synced, and signing out revokes the key.",
  ],
  ["Right-click entries", "Pluck this page, this link or this selection, from the context menu."],
  [
    "Optional: your open tabs",
    "Only if you turn on “follow the tab I am looking at” in settings. Off by default, and the browser asks you first.",
  ],
];

function Install({ className = "" }: { className?: string }) {
  return STORE_URL ? (
    <a
      href={STORE_URL}
      className={`inline-block bg-[var(--ink)] px-5 py-3 text-[var(--paper)] transition-opacity hover:opacity-85 ${className}`}
    >
      Add to Chrome
    </a>
  ) : (
    <a
      href={SOURCE_URL}
      className={`inline-block bg-[var(--ink)] px-5 py-3 text-[var(--paper)] transition-opacity hover:opacity-85 ${className}`}
    >
      Get it from GitHub
    </a>
  );
}

export default function ExtensionPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <p className="mono text-xs uppercase tracking-wider text-[var(--ink-faint)]">
        {SITE.name} for Chrome
      </p>
      <h1 className="mt-3 text-5xl">Pluck the page you are on.</h1>
      <p className="mt-5 text-lg text-[var(--ink-soft)]">
        One click turns the tab in front of you into clean markdown, structured JSON, brand data or
        a screenshot: what a prompt needs, instead of raw HTML. It works on pages behind a sign-in
        too, and only ever on the tab you point it at.
      </p>
      <div className="mt-7 flex flex-wrap items-center gap-3">
        <Install />
        <Link href="/docs/extension" className="btn-outline px-5 py-3">
          How it works
        </Link>
      </div>
      <p className="mt-4 text-sm text-[var(--ink-faint)]">
        {STORE_URL
          ? "For Chrome, Edge and other Chromium browsers with a side panel. "
          : "The Chrome Web Store listing is on its way; until then it loads from source in a minute. "}
        {SIGNUP_GRANT > 0 &&
          `Free to try: a new account starts with ${formatNumber(SIGNUP_GRANT)} credits, no card.`}
      </p>

      <figure className="sheet mt-12 overflow-hidden">
        {/* biome-ignore lint/performance/noImgElement: a static screenshot, already sized */}
        <img
          src="/extension/markdown.png"
          alt={`The ${SITE.name} side panel next to an article, showing the article as markdown with a copy button and a token count.`}
          width={1280}
          height={800}
          className="block h-auto w-full"
        />
      </figure>

      <section className="mt-20">
        <h2 className="text-3xl">Seven tools in one side panel</h2>
        <p className="mt-3 text-[var(--ink-soft)]">
          Everything the API does for a page, without writing a request. Each run spends the same
          credits the API would.
        </p>
        <dl className="mt-8 grid gap-x-10 gap-y-7 md:grid-cols-2">
          {tools.map((tool) => (
            <div key={tool.name}>
              <dt className="leaders">
                <span className="font-[family-name:var(--font-display)] text-xl font-semibold">
                  {tool.name}
                </span>
                <span className="mono order-last text-xs text-[var(--ink-faint)]">{tool.cost}</span>
              </dt>
              <dd className="mt-1 text-sm text-[var(--ink-soft)]">{tool.text}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-20 grid gap-10 lg:grid-cols-2">
        <div>
          <h2 className="text-3xl">Two ways to read a page</h2>
          <dl className="mt-6 space-y-6">
            <div>
              <dt className="font-semibold">Fetch the page</dt>
              <dd className="mt-1 text-sm text-[var(--ink-soft)]">
                {SITE.name} fetches the address itself, renders JavaScript when the page needs it,
                and keeps only the content. The cleanest result, for anything public.
              </dd>
            </div>
            <div>
              <dt className="font-semibold">This tab as I see it</dt>
              <dd className="mt-1 text-sm text-[var(--ink-soft)]">
                For a dashboard, a paywalled article or anything behind a sign-in: the extension
                reads what is on your screen and sends the visible text for conversion. Hidden
                elements are left out, and anything typed into a form field is never sent.
              </dd>
            </div>
          </dl>
        </div>
        <figure className="sheet overflow-hidden">
          {/* biome-ignore lint/performance/noImgElement: a static screenshot, already sized */}
          <img
            src="/extension/tools.png"
            alt={`The ${SITE.name} side panel listing its tools with what each one costs.`}
            width={1280}
            height={800}
            loading="lazy"
            className="block h-auto w-full"
          />
        </figure>
      </section>

      <section className="mt-20">
        <h2 className="text-3xl">What it can see, and when</h2>
        <p className="mt-3 text-[var(--ink-soft)]">
          Installing it shows no permission warning, because it asks for no standing access to any
          site. It does nothing until you ask, has no analytics, and keeps no browsing history. The
          whole thing is{" "}
          <a href={SOURCE_URL} className="text-[var(--accent)] underline underline-offset-4">
            open source
          </a>
          .
        </p>
        <dl className="mt-8 grid gap-x-10 gap-y-6 md:grid-cols-2">
          {permissions.map(([name, text]) => (
            <div key={name}>
              <dt className="font-semibold">{name}</dt>
              <dd className="mt-1 text-sm text-[var(--ink-soft)]">{text}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-20">
        <h2 className="text-3xl">Start in a minute</h2>
        <ol className="mt-6 grid gap-6 md:grid-cols-3">
          {[
            ["Install it", "Add the extension and pin it, so the button sits in your toolbar."],
            [
              "Connect your account",
              `The extension opens ${SITE.name} in a tab. Sign in, or sign up, and approve: it gets an API key of its own that you can revoke any time.`,
            ],
            [
              "Click it on any page",
              "Or press Alt+Shift+P. Alt+Shift+M plucks the page as markdown straight away, and right-click works on pages, links and selections.",
            ],
          ].map(([title, text], i) => (
            <li key={title} className="sheet p-5">
              <p className="mono text-xs text-[var(--accent)]">{i + 1}</p>
              <h3 className="mt-2 text-xl">{title}</h3>
              <p className="mt-2 text-sm text-[var(--ink-soft)]">{text}</p>
            </li>
          ))}
        </ol>
        <p className="mt-6 text-sm text-[var(--ink-soft)]">
          Running your own instance? Paste its address and an API key into the extension's settings
          and nothing leaves your server.{" "}
          <Link
            href="/docs/extension"
            className="text-[var(--accent)] underline underline-offset-4"
          >
            Read the guide
          </Link>
          .
        </p>
        <div className="mt-8">
          <Install />
        </div>
      </section>
    </div>
  );
}
