#!/usr/bin/env node
/**
 * Renders the Chrome Web Store images into `store/out/`:
 *
 *   screenshot-1..5   1280x800, the real panel running in a browser frame
 *   promo-small       440x280 tile
 *   promo-marquee     1400x560 tile
 *   icon-128          the store icon, copied from the build
 *
 * Nothing is drawn by hand. Each screenshot is the panel bundle from `dist/`,
 * driven with real clicks and typing against canned API answers
 * (store/harness/mock.js), so the images cannot drift from the product.
 *
 * It needs a Chromium-family browser on this machine: Chrome, then Edge, or
 * whatever CHROME_PATH points at. No browser is downloaded.
 */
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "store", "out");
const SITE_IMAGES = join(ROOT, "..", "web", "public", "extension");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".json": "application/json",
};

/** Serves the package folder, so pages, bundles and fonts share one origin. */
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname));
  const file = join(ROOT, path);
  if (!file.startsWith(ROOT)) return res.writeHead(403).end();
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;

async function launch() {
  if (process.env.CHROME_PATH) return chromium.launch({ executablePath: process.env.CHROME_PATH });
  for (const channel of ["chrome", "msedge", "chromium"]) {
    try {
      return await chromium.launch({ channel });
    } catch {
      // Try the next browser.
    }
  }
  throw new Error("No Chrome or Edge found. Set CHROME_PATH to a Chromium-family browser.");
}

const tool = (name) => async (panel) => {
  await panel.locator(".menu-item", { hasText: name }).first().click();
};

/** Each screenshot: its caption, and what to do in the panel before the shutter. */
const SHOTS = [
  {
    name: "screenshot-1-markdown",
    headline: "Any page, as clean *markdown.*",
    sub: "One click turns the tab in front of you into text a model can actually read.",
    async act(panel) {
      await tool("Markdown")(panel);
      await panel.getByRole("button", { name: "Pluck as markdown" }).click();
      await panel.locator(".code").waitFor();
    },
  },
  {
    name: "screenshot-2-tools",
    headline: "Seven tools in *one side panel.*",
    sub: "Markdown, extraction, brand data, design tokens, site maps, screenshots and search.",
    async act(panel) {
      await panel.locator(".menu-item").first().waitFor();
    },
  },
  {
    name: "screenshot-3-extract",
    headline: "Say what you want. Get *JSON* back.",
    sub: "Describe the data in a sentence, or hand it a JSON Schema to match exactly.",
    async act(panel) {
      await tool("Extract")(panel);
      await panel
        .locator("textarea")
        .first()
        .fill("The roast levels with their temperatures, and the brewing advice.");
      await panel.getByRole("button", { name: "Extract as JSON" }).click();
      await panel.locator(".code").waitFor();
    },
  },
  {
    name: "screenshot-4-brand",
    headline: "Logos, colors and fonts for *any site.*",
    sub: "A company profile from nothing but its domain, ready to copy as JSON.",
    async act(panel) {
      await tool("Brand")(panel);
      await panel.getByRole("button", { name: "Look up the brand" }).click();
      await panel.locator(".logos").waitFor();
    },
  },
  {
    name: "screenshot-5-private",
    theme: "dark",
    headline: "Reads a page *only when you ask.*",
    sub: "Pages behind a sign-in work too. Nothing runs in the background, and form fields are never sent.",
    async act(panel) {
      await tool("Markdown")(panel);
      await panel.getByText("This tab as I see it").click();
      await panel.getByRole("button", { name: "Pluck as markdown" }).click();
      await panel.locator(".code").waitFor();
    },
  },
];

const browser = await launch();
await mkdir(OUT, { recursive: true });

/** The store wants 24-bit PNG: no alpha channel. */
async function capture(page, name) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
  await sharp(await page.screenshot({ type: "png" }))
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toFile(join(OUT, `${name}.png`));
  console.log(`store/out/${name}.png`);
}

try {
  for (const shot of SHOTS) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const query = new URLSearchParams({ headline: shot.headline, sub: shot.sub });
    if (shot.theme) query.set("theme", shot.theme);
    await page.goto(`${base}/store/scenes/shot.html?${query}`);
    await shot.act(page.frameLocator("#panel"));
    await capture(page, shot.name);
    await page.close();
  }

  for (const [size, width, height] of [
    ["small", 440, 280],
    ["marquee", 1400, 560],
  ]) {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.goto(`${base}/store/scenes/promo.html?size=${size}`);
    if (size === "marquee")
      await page.frameLocator("#panel").locator(".menu-item").first().waitFor();
    await capture(page, `promo-${size}-${width}x${height}`);
    await page.close();
  }

  await copyFile(join(ROOT, "dist/icons/icon-128.png"), join(OUT, "icon-128.png"));
  console.log("store/out/icon-128.png");

  // The site's /extension page shows the first two; these copies are committed.
  await mkdir(SITE_IMAGES, { recursive: true });
  for (const [shot, name] of [
    ["screenshot-1-markdown", "markdown"],
    ["screenshot-2-tools", "tools"],
  ]) {
    await copyFile(join(OUT, `${shot}.png`), join(SITE_IMAGES, `${name}.png`));
    console.log(`apps/web/public/extension/${name}.png`);
  }
} finally {
  await browser.close();
  server.close();
}
