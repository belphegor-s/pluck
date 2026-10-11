#!/usr/bin/env node
/**
 * Builds the extension into `dist/`, ready to load unpacked or to zip.
 *
 *   node scripts/build.mjs            the store build
 *   node scripts/build.mjs --dev      pinned development id, source maps
 *   node scripts/build.mjs --watch    rebuild on change
 *   node scripts/build.mjs --out=dir  build somewhere other than dist/
 *
 * PLUCK_SITE_URL and PLUCK_API_URL point a build at another instance, for
 * local work (`http://localhost:3000`, `http://localhost:8080`) or for a
 * self-hoster shipping their own copy.
 *
 * Product naming, prices and the sign-in protocol are read from @pluck/shared
 * here and baked in as constants, so the bundle carries none of that package's
 * schemas and a rename still reaches the extension.
 */
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEV_EXTENSION } from "@pluck/shared";
import { context } from "esbuild";
import sharp from "sharp";
import { createBuildConfig } from "./config.mjs";
import { buildManifest } from "./manifest.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = join(ROOT, "..", "..");
const args = new Set(process.argv.slice(2));
const outArg = [...args].find((arg) => arg.startsWith("--out="))?.slice("--out=".length);
const OUT = outArg ? resolve(outArg) : join(ROOT, "dist");
const dev = args.has("--dev");
const watch = args.has("--watch");

const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));
const buildConfig = createBuildConfig({ version: pkg.version, dev });
const { siteUrl } = buildConfig;

await rm(OUT, { recursive: true, force: true });
await mkdir(join(OUT, "icons"), { recursive: true });

// Static files: the two pages and the locale strings.
await cp(join(ROOT, "static"), OUT, { recursive: true });

// The store truncates anything longer, mid-word.
const messages = JSON.parse(await readFile(join(ROOT, "static/_locales/en/messages.json"), "utf8"));
const limits = { extName: 75, extShortName: 12, extDescription: 132 };
for (const [key, max] of Object.entries(limits)) {
  const length = messages[key]?.message.length ?? 0;
  if (!length || length > max)
    throw new Error(`_locales/en ${key} must be 1 to ${max} characters, got ${length}.`);
}

await writeFile(
  join(OUT, "manifest.json"),
  `${JSON.stringify(buildManifest({ version: pkg.version, siteUrl, dev, devKey: DEV_EXTENSION.key }), null, 2)}\n`,
);

// Icons come from the one brand source. The store asks for the 128px icon to
// be 96px of artwork inside 16px of clear space; the small sizes fill the box.
const icon = await readFile(join(REPO, "assets/icon.svg"));
for (const size of [16, 32, 48]) {
  await sharp(icon, { density: 600 })
    .resize(size, size)
    .png()
    .toFile(join(OUT, `icons/icon-${size}.png`));
}
await sharp(icon, { density: 600 })
  .resize(96, 96)
  .extend({ top: 16, bottom: 16, left: 16, right: 16, background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toFile(join(OUT, "icons/icon-128.png"));

// The typefaces are shared with the site; their licences travel with them.
for (const licence of ["OFL-bricolage-grotesque.txt", "OFL-ibm-plex.txt"])
  await cp(join(REPO, "apps/web/src/fonts", licence), join(OUT, "fonts", licence));

const bundle = await context({
  absWorkingDir: ROOT,
  entryPoints: {
    background: "src/background/index.ts",
    panel: "src/panel/main.tsx",
    options: "src/options/main.tsx",
  },
  outdir: OUT,
  bundle: true,
  // Classic scripts: no module loading to go wrong, and the page reader that
  // is injected into tabs must be a plain self-contained function.
  format: "iife",
  platform: "browser",
  target: "chrome116",
  jsx: "automatic",
  minify: !dev,
  sourcemap: dev ? "inline" : false,
  legalComments: "none",
  define: {
    __PLUCK__: JSON.stringify(buildConfig),
    "process.env.NODE_ENV": JSON.stringify(dev ? "development" : "production"),
  },
  loader: { ".woff2": "file" },
  assetNames: "fonts/[name]",
  logLevel: "info",
});

if (watch) {
  await bundle.watch();
  console.log(`watching; load ${OUT} as an unpacked extension`);
} else {
  await bundle.rebuild();
  await bundle.dispose();
}
