#!/usr/bin/env node
/**
 * End-to-end check of the extension in a real Chromium, against a stand-in
 * for the site and the API that runs inside this script.
 *
 * It covers what unit tests cannot: that the built extension loads under its
 * own content security policy, that sign-in completes across the site page,
 * the service worker and the token exchange (with PKCE and the origin check
 * enforced by the stand-in exactly as the real routes do), that the page
 * reader survives minification and leaves out what it promises to, and that
 * the panel talks to the API from an extension page with no host permissions.
 *
 *   pnpm --filter @pluck/extension e2e
 *
 * It needs a Chromium that can load extensions: Playwright's own
 * (`pnpm exec playwright-core install chromium`), or CHROMIUM_PATH. Branded
 * Chrome no longer accepts unpacked extensions from the command line.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEV_EXTENSION, EXTENSION_MESSAGE } from "@pluck/shared";
import { build } from "esbuild";
import { chromium } from "playwright-core";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, ".e2e", "dist");
const EXTENSION_ORIGIN = `chrome-extension://${DEV_EXTENSION.id}`;
const API_KEY = "pk_live_e2e0000000000000000000000000000";

/* ------------------------------------------------------------ stand-in */

const seen = { exchanges: [], revoked: [], parsed: [], authorized: 0 };
const codes = new Map();

const ARTICLE = `<!doctype html>
<html lang="en">
  <head>
    <title>Field notes on plucking</title>
    <style>.gone { display: none } .wrap { display: contents } .faded { visibility: hidden }</style>
    <script>window.SECRET_SCRIPT = "SECRET-SCRIPT";</script>
  </head>
  <body>
    <nav><a href="/elsewhere">NAV-LINK</a></nav>
    <header>SITE-HEADER</header>
    <main>
      <article>
        <h1 id="title">Field notes on plucking</h1>
        <p id="first">VISIBLE-PARAGRAPH with a <a href="/relative/path">relative link</a>.</p>
        <div class="wrap"><p>CONTENTS-VISIBLE inside a display: contents wrapper.</p></div>
        <p class="gone">SECRET-HIDDEN</p>
        <p class="faded">SECRET-FADED</p>
        <p hidden>SECRET-ATTRIBUTE</p>
        <form><input value="SECRET-INPUT" /><textarea>SECRET-TEXTAREA</textarea></form>
        <img data-src="/lazy.png" alt="lazy picture" />
        <pre><code class="language-js" style="color: red" onclick="1">const kept = true;</code></pre>
        <aside>ASIDE-NOISE</aside>
        <p>${"Filler sentence so the article is the bulk of the page. ".repeat(12)}</p>
      </article>
    </main>
    <footer>SITE-FOOTER</footer>
  </body>
</html>`;

const connectPage = (code) => `<!doctype html><title>connecting</title><script>
  const query = new URLSearchParams(location.search);
  const ext = query.get("ext");
  chrome.runtime.sendMessage(ext, { type: ${JSON.stringify(EXTENSION_MESSAGE.ping)} }, (pong) => {
    window.pong = pong;
    chrome.runtime.sendMessage(
      ext,
      { type: ${JSON.stringify(EXTENSION_MESSAGE.connect)}, code: ${JSON.stringify(code)}, state: query.get("state") },
      (reply) => { window.reply = reply; document.title = reply && reply.ok ? "connected" : "failed"; },
    );
  });
</script>`;

const meta = { requestId: "req_e2e", creditsUsed: 2, cached: false, durationMs: 12 };

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString("utf8");
  const origin = req.headers.origin;

  // The same policy as the real routes: the API answers anyone, the site's
  // extension routes only an allowed extension origin.
  const isApi = url.pathname.startsWith("/v1/");
  const cors = isApi
    ? {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "authorization, content-type",
      }
    : origin === EXTENSION_ORIGIN
      ? {
          "access-control-allow-origin": origin,
          "access-control-allow-headers": "authorization, content-type",
        }
      : {};
  const send = (status, payload, type = "application/json") => {
    res.writeHead(status, { "content-type": type, ...cors });
    res.end(type === "application/json" ? JSON.stringify(payload) : payload);
  };
  if (req.method === "OPTIONS") return send(204, "", "text/plain");

  if (url.pathname === "/article") return send(200, ARTICLE, "text/html; charset=utf-8");
  if (url.pathname === "/blank")
    return send(200, "<!doctype html><title>blank</title>", "text/html");

  if (url.pathname === "/extension/connect") {
    assert.equal(
      url.searchParams.get("ext"),
      DEV_EXTENSION.id,
      "connect page got the extension id",
    );
    assert.match(url.searchParams.get("challenge") ?? "", /^[A-Za-z0-9_-]{43}$/);
    assert.match(url.searchParams.get("state") ?? "", /^[A-Za-z0-9_-]{16,64}$/);
    assert.match(url.searchParams.get("device") ?? "", /^[\w .-]{1,40}$/);
    const code = randomBytes(32).toString("base64url");
    codes.set(code, url.searchParams.get("challenge"));
    seen.authorized++;
    return send(200, connectPage(code), "text/html");
  }

  if (url.pathname === "/api/extension/token") {
    if (origin !== EXTENSION_ORIGIN) return send(403, { error: "origin" });
    const { code, verifier } = JSON.parse(body);
    const challenge = codes.get(code);
    codes.delete(code);
    const proof = createHash("sha256").update(String(verifier)).digest("base64url");
    if (!challenge || proof !== challenge) return send(400, { error: "This sign-in has expired." });
    seen.exchanges.push({ origin });
    return send(200, {
      apiKey: API_KEY,
      apiUrl: `http://localhost:${server.address().port}`,
      workspace: { id: "org_e2e", name: "E2E workspace" },
      user: { name: "E2E", email: "e2e@example.com" },
    });
  }

  if (url.pathname === "/api/extension/revoke") {
    seen.revoked.push(req.headers.authorization);
    return send(200, { revoked: true });
  }

  if (isApi) {
    if (!/^Bearer pk_live_/.test(req.headers.authorization ?? ""))
      return send(401, { error: { code: "invalid_api_key", message: "Invalid API key." } });
    if (url.pathname === "/v1/usage")
      return send(200, {
        data: {
          balance: 990,
          period: { from: "", to: "" },
          totalCredits: 0,
          totalRequests: 0,
          byEndpoint: [],
          daily: [],
        },
        meta,
      });
    if (url.pathname === "/v1/search")
      return send(200, {
        data: {
          results: [
            {
              url: "https://example.com/a",
              title: "RESULT-ONE",
              snippet: "first",
              publishedAt: null,
              image: null,
              source: null,
            },
          ],
        },
        meta,
      });
    if (url.pathname === "/v1/parse") {
      const html = Buffer.from(JSON.parse(body).base64, "base64").toString("utf8");
      seen.parsed.push(html);
      const text = html
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      return send(200, {
        data: { markdown: text, contentType: "text/html", pages: null, title: null },
        meta,
      });
    }
  }
  send(404, { error: { code: "not_found", message: url.pathname } });
});

/* ---------------------------------------------------------------- setup */

await new Promise((resolve) => server.listen(0, "localhost", resolve));
const site = `http://localhost:${server.address().port}`;

/** Some other website, which the extension must not be reachable from. */
const stranger = createServer((_req, res) => {
  res.writeHead(200, { "content-type": "text/html" });
  res.end("<!doctype html><title>stranger</title>");
});
await new Promise((resolve) => stranger.listen(0, "127.0.0.1", resolve));

// A development build pointed at the stand-in. One test-only change: the
// manifest gains access to localhost, standing in for the toolbar click that
// grants `activeTab` in real use and that automation cannot perform.
const built = spawnSync(
  process.execPath,
  [join(ROOT, "scripts/build.mjs"), "--dev", `--out=${DIST}`],
  {
    env: { ...process.env, PLUCK_SITE_URL: site, PLUCK_API_URL: site },
    encoding: "utf8",
  },
);
assert.equal(built.status, 0, built.stderr);
const manifestPath = join(DIST, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
manifest.host_permissions = ["http://localhost/*"];
await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

const profile = await mkdtemp(join(tmpdir(), "pluck-e2e-"));
const context = await chromium.launchPersistentContext(profile, {
  ...(process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : { channel: "chromium" }),
  headless: true,
  args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
});

const failures = [];
const step = async (name, run) => {
  try {
    await run();
    console.log(`  ok    ${name}`);
  } catch (err) {
    failures.push(name);
    console.log(
      `  FAIL  ${name}\n        ${String(err?.message ?? err)
        .split("\n")
        .join("\n        ")}`,
    );
  }
};

/** Page errors and policy violations on extension pages fail the run. */
const problems = [];
const watch = (page) => {
  page.on("pageerror", (err) => problems.push(`${page.url()}: ${err.message}`));
  page.on("console", (message) => {
    if (message.type() === "error" && !/favicon|ERR_|status of 40/.test(message.text()))
      problems.push(`${page.url()}: ${message.text()}`);
  });
  return page;
};

try {
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  const id = new URL(worker.url()).host;
  const panelUrl = `chrome-extension://${id}/panel.html`;
  const optionsUrl = `chrome-extension://${id}/options.html`;

  await step("the development build gets the pinned extension id", () => {
    assert.equal(id, DEV_EXTENSION.id);
  });

  const panel = watch(await context.newPage());
  await panel.goto(panelUrl);

  await step("a new install starts signed out", async () => {
    await panel.getByRole("button", { name: "Connect your account" }).waitFor();
    assert.equal(await panel.locator(".menu--static .menu-item").count(), 7);
  });

  await step("the site cannot finish a sign-in the extension did not start", async () => {
    const page = await context.newPage();
    await page.goto(`${site}/blank`);
    const reply = await page.evaluate(
      ([ext, type]) =>
        new Promise((resolve) =>
          chrome.runtime.sendMessage(
            ext,
            { type, code: "x".repeat(43), state: "y".repeat(22) },
            resolve,
          ),
        ),
      [id, EXTENSION_MESSAGE.connect],
    );
    assert.equal(reply.ok, false);
    await page.close();
  });

  await step("a page on any other origin cannot reach the extension at all", async () => {
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${stranger.address().port}/`);
    assert.equal(
      await page.evaluate(() => typeof globalThis.chrome?.runtime?.sendMessage),
      "undefined",
    );
    await page.close();
  });

  await step("connecting signs in through the site, with PKCE", async () => {
    const [connect] = await Promise.all([
      context.waitForEvent("page"),
      panel.getByRole("button", { name: "Connect your account" }).click(),
    ]);
    // The extension closes the connect tab itself once it is signed in.
    await connect.waitForEvent("close", { timeout: 15_000 });
    assert.equal(seen.authorized, 1);
    assert.deepEqual(seen.exchanges, [{ origin: EXTENSION_ORIGIN }]);
    await panel.locator("nav.menu .menu-item").first().waitFor();
    assert.equal(await panel.locator("nav.menu .menu-item").count(), 7);
  });

  await step("the panel reads the balance from the API with the new key", async () => {
    await panel.getByText("990 credits").waitFor();
  });

  await step("a tool runs from an extension page with no host permission for the API", async () => {
    await panel.locator(".menu-item", { hasText: "Search" }).click();
    await panel.getByRole("searchbox").fill("anything");
    await panel.getByRole("button", { name: "Search", exact: true }).click();
    await panel.getByText("RESULT-ONE").waitFor();
    await panel.getByRole("button", { name: "Back to all tools" }).click();
  });

  const article = await context.newPage();
  await article.goto(`${site}/article`);

  await step("the page reader works after minification, on its own", async () => {
    // Bundled the way the extension is, then rebuilt from its source text, as
    // chrome.scripting.executeScript does. A reference to anything outside the
    // function would throw here.
    const bundle = await build({
      entryPoints: [join(ROOT, "src/lib/capture.ts")],
      bundle: true,
      minify: true,
      format: "iife",
      globalName: "Reader",
      target: "chrome116",
      write: false,
    });
    await article.addScriptTag({ content: bundle.outputFiles[0].text });
    const read = (mode) =>
      article.evaluate((m) => {
        const standalone = new Function(`return (${globalThis.Reader.capturePage.toString()})`)();
        return standalone(m, 1_000_000);
      }, mode);

    const main = await read("main");
    assert.equal(main.title, "Field notes on plucking");
    assert.equal(main.url, `${site}/article`);
    for (const kept of ["VISIBLE-PARAGRAPH", "CONTENTS-VISIBLE", "const kept = true;"])
      assert.ok(main.html.includes(kept), `keeps ${kept}`);
    for (const dropped of [
      "SECRET-HIDDEN",
      "SECRET-FADED",
      "SECRET-ATTRIBUTE",
      "SECRET-INPUT",
      "SECRET-TEXTAREA",
      "SECRET-SCRIPT",
      "NAV-LINK",
      "SITE-HEADER",
      "SITE-FOOTER",
      "ASIDE-NOISE",
      "onclick",
      "color: red",
    ])
      assert.ok(!main.html.includes(dropped), `drops ${dropped}`);
    assert.ok(main.html.includes(`href="${site}/relative/path"`), "makes links absolute");
    assert.ok(main.html.includes(`src="${site}/lazy.png"`), "resolves lazy images");
    assert.ok(main.html.includes('class="language-js"'), "keeps the code language");

    const whole = await read("page");
    assert.ok(whole.html.includes("SITE-HEADER") && whole.html.includes("NAV-LINK"));
    assert.ok(!whole.html.includes("SECRET-INPUT") && !whole.html.includes("SECRET-HIDDEN"));

    assert.equal(await read("selection"), null, "no selection reads as nothing");
    await article.evaluate(() => {
      const range = document.createRange();
      range.selectNodeContents(document.getElementById("first"));
      getSelection().removeAllRanges();
      getSelection().addRange(range);
    });
    const selection = await read("selection");
    assert.ok(selection.html.includes("VISIBLE-PARAGRAPH"));
    assert.ok(!selection.html.includes("CONTENTS-VISIBLE"));
  });

  await step("markdown reads the tab in front, and sends only what is visible", async () => {
    // The article becomes the active tab; the panel, still open, follows it.
    await article.bringToFront();
    await panel.locator(".menu-item", { hasText: "Markdown" }).click();
    await panel.getByText("Field notes on plucking").first().waitFor();
    await panel.getByRole("button", { name: "Pluck as markdown" }).click();
    await panel.locator(".code").waitFor();
    const result = await panel.locator(".code").innerText();
    assert.ok(result.includes("VISIBLE-PARAGRAPH"));
    assert.equal(seen.parsed.length, 1);
    assert.ok(!seen.parsed[0].includes("SECRET"), "nothing hidden or typed was sent");
    await panel.getByRole("button", { name: "Back to all tools" }).click();
    assert.equal(
      await panel.locator(".history-item").count(),
      2,
      "both runs are in the recent list",
    );
  });

  const options = watch(await context.newPage());
  await options.goto(optionsUrl);

  await step("signing out revokes the key on the site", async () => {
    await options.getByText("E2E workspace").waitFor();
    await options.getByRole("button", { name: "Sign out and revoke this key" }).click();
    await options.getByRole("button", { name: "Connect your account" }).waitFor();
    assert.deepEqual(seen.revoked, [`Bearer ${API_KEY}`]);
    await panel.getByRole("button", { name: "Connect your account" }).waitFor();
  });

  await step("a self-hosted instance connects with a pasted key", async () => {
    await options.getByLabel("API address").fill(site);
    await options.getByLabel("API key").fill("not-a-key");
    await options.getByRole("button", { name: "Check and save" }).click();
    await options.getByText("That instance did not accept the key.").waitFor();
    await options.getByLabel("API key").fill("pk_live_selfhosted");
    await options.getByRole("button", { name: "Check and save" }).click();
    await options.getByText("Connected. The key answered and is saved.").waitFor();
    await options.getByRole("button", { name: "Forget this key" }).click();
    assert.equal(seen.revoked.length, 1, "a pasted key is forgotten, never revoked");
  });

  await step("no errors or policy violations on the extension pages", () => {
    assert.deepEqual(problems, []);
  });
} finally {
  await context.close();
  server.close();
  stranger.close();
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}

if (failures.length) {
  console.error(`\n${failures.length} failed`);
  process.exit(1);
}
console.log("\nall passed");
