import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import {
  DESKTOP_UA,
  isPrivateAddress,
  MOBILE_UA,
  type ProxyPool,
  type Renderer,
  type RenderRequest,
  type RenderResult,
  styleguideProbe,
} from "@pluck/core";
import type { Logger } from "@pluck/runtime";
import { PluckError } from "@pluck/shared";
import { LRUCache } from "lru-cache";
import { type Browser, type BrowserContext, chromium, type Page } from "playwright-core";
import sharp from "sharp";

const AD_HOSTS =
  /(^|\.)(doubleclick\.net|googlesyndication\.com|googleadservices\.com|google-analytics\.com|googletagmanager\.com|adservice\.google\.com|facebook\.net|connect\.facebook\.net|scorecardresearch\.com|hotjar\.com|clarity\.ms|segment\.io|segment\.com|mixpanel\.com|amplitude\.com|taboola\.com|outbrain\.com|criteo\.com|adnxs\.com|amazon-adsystem\.com|quantserve\.com|moatads\.com|pubmatic\.com|rubiconproject\.com|openx\.net|intercomcdn\.com|fullstory\.com|newrelic\.com|nr-data\.net|sentry\.io|tiktok\.com\/i18n\/pixel|onetrust\.com|cookielaw\.org|cookiebot\.com|trustarc\.com)$/;

const HEAVY_TYPES = new Set(["image", "media", "font"]);

export interface BrowserPoolOptions {
  concurrency: number;
  proxies: ProxyPool;
  allowPrivateNetwork: boolean;
  executablePath?: string;
  log: Logger;
  /**
   * Resolves the pool belonging to one account. A render job carries only a
   * user id, so proxy credentials are read here rather than passed through the
   * queue.
   */
  poolFor?: (userId: string) => Promise<ProxyPool>;
}

/**
 * One Chromium process per worker, a fresh isolated context per render.
 * The browser is recycled after a number of pages to bound memory growth.
 */
export class BrowserPool implements Renderer {
  private browser: Promise<Browser> | null = null;
  private pagesServed = 0;
  private active = 0;
  private readonly waiters: (() => void)[] = [];
  private readonly dnsCache = new LRUCache<string, boolean>({ max: 10_000, ttl: 60_000 });

  constructor(private readonly opts: BrowserPoolOptions) {}

  private launch(): Promise<Browser> {
    this.browser ??= chromium
      .launch({
        headless: true,
        executablePath: this.opts.executablePath,
        args: [
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--no-first-run",
          "--no-default-browser-check",
          "--disable-background-networking",
          "--disable-renderer-backgrounding",
          "--disable-backgrounding-occluded-windows",
          "--disable-component-update",
          "--disable-features=Translate,MediaRouter,OptimizationHints,AutofillServerCommunication",
          "--mute-audio",
          "--blink-settings=imagesEnabled=true",
        ],
      })
      .then((b) => {
        b.on("disconnected", () => {
          this.opts.log.warn("browser disconnected; will relaunch");
          this.browser = null;
        });
        return b;
      })
      .catch((err: unknown) => {
        this.browser = null;
        throw err;
      });
    return this.browser;
  }

  private async acquire(): Promise<void> {
    if (this.active < this.opts.concurrency) {
      this.active++;
      return;
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
    this.active++;
  }

  private release(): void {
    this.active--;
    this.waiters.shift()?.();
    if (++this.pagesServed >= 500 && this.active === 0 && this.browser) {
      const old = this.browser;
      this.browser = null;
      this.pagesServed = 0;
      void old.then((b) => b.close()).catch(() => {});
    }
  }

  private async isAllowedHost(hostname: string): Promise<boolean> {
    if (this.opts.allowPrivateNetwork) return true;
    const host = hostname.replace(/^\[|\]$/g, "");
    if (isIP(host)) return !isPrivateAddress(host);
    if (/(^|\.)(localhost|local|internal)$/i.test(host)) return false;
    const cached = this.dnsCache.get(host);
    if (cached !== undefined) return cached;
    const ok = await lookup(host, { all: true })
      .then((addrs) => addrs.length > 0 && addrs.every((a) => !isPrivateAddress(a.address)))
      .catch(() => true); // Unresolvable hosts fail on their own inside the browser.
    this.dnsCache.set(host, ok);
    return ok;
  }

  async render(req: RenderRequest): Promise<RenderResult> {
    if (!(await this.isAllowedHost(new URL(req.url).hostname))) {
      throw new PluckError("forbidden", "Private network addresses cannot be scraped.");
    }
    await this.acquire();
    let context: BrowserContext | null = null;
    try {
      const browser = await this.launch();
      const pool =
        req.userId && this.opts.poolFor
          ? await this.opts.poolFor(req.userId).catch(() => this.opts.proxies)
          : this.opts.proxies;
      const proxy = req.proxy === "none" ? null : pool.pick(req.proxy, { country: req.country });
      const viewport =
        req.screenshot?.viewport ??
        (req.mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 });

      context = await browser.newContext({
        userAgent: req.mobile ? MOBILE_UA : DESKTOP_UA,
        viewport,
        isMobile: req.mobile ?? false,
        hasTouch: req.mobile ?? false,
        deviceScaleFactor: 1,
        locale: "en-US",
        ignoreHTTPSErrors: true,
        serviceWorkers: "block",
        extraHTTPHeaders: req.headers,
        proxy: proxy ? toPlaywrightProxy(proxy.url) : undefined,
      });

      const keepHeavy = Boolean(req.screenshot) || req.evaluate === "styleguide";
      await context.route("**/*", async (route) => {
        const request = route.request();
        let url: URL;
        try {
          url = new URL(request.url());
        } catch {
          return route.abort();
        }
        if (url.protocol === "data:" || url.protocol === "blob:") return route.continue();
        if (url.protocol !== "http:" && url.protocol !== "https:") return route.abort();
        if (req.blockAds && AD_HOSTS.test(url.hostname)) return route.abort("blockedbyclient");
        if (!keepHeavy && HEAVY_TYPES.has(request.resourceType()))
          return route.abort("blockedbyclient");
        if (!(await this.isAllowedHost(url.hostname))) return route.abort("accessdenied");
        return route.continue();
      });

      const page = await context.newPage();
      const deadline = Date.now() + req.timeout;
      const remaining = () => Math.max(1_000, deadline - Date.now());

      const response = await page
        .goto(req.url, { waitUntil: "domcontentloaded", timeout: req.timeout })
        .catch((err: Error) => {
          if (/timeout/i.test(err.message))
            throw new PluckError("target_timeout", `Timed out loading ${req.url}`);
          if (/ERR_NAME_NOT_RESOLVED/.test(err.message))
            throw new PluckError(
              "target_unreachable",
              `Could not resolve ${new URL(req.url).hostname}`,
            );
          if (/ERR_ACCESS_DENIED|ERR_BLOCKED_BY_CLIENT/.test(err.message))
            throw new PluckError("forbidden", "Private network addresses cannot be scraped.");
          throw new PluckError(
            "target_unreachable",
            err.message.split("\n")[0] ?? "Navigation failed.",
          );
        });

      // Bounded settle: full load, then a short quiet-network window for late XHR content.
      await page
        .waitForLoadState("load", { timeout: Math.min(5_000, remaining()) })
        .catch(() => {});
      // Nudge IntersectionObserver-driven lazy content (feeds, listings) without a full scroll.
      await page
        .evaluate(async () => {
          for (let i = 0; i < 3; i++) {
            window.scrollBy(0, window.innerHeight);
            await new Promise((r) => setTimeout(r, 120));
          }
          window.scrollTo(0, 0);
        })
        .catch(() => {});
      await page
        .waitForLoadState("networkidle", { timeout: Math.min(2_000, remaining()) })
        .catch(() => {});
      if (req.waitFor) await page.waitForTimeout(Math.min(req.waitFor, remaining()));
      if (req.actions?.length) await runActions(page, req, remaining);
      if (req.screenshot?.fullPage) await autoScroll(page, remaining());

      const html = await page.content();
      const result: RenderResult = {
        finalUrl: page.url(),
        status: response?.status() ?? 200,
        contentType: (await response?.headerValue("content-type").catch(() => null)) ?? "text/html",
        html,
      };

      if (req.screenshot) {
        const format = req.screenshot.format;
        const raw = await page.screenshot({
          fullPage: req.screenshot.fullPage,
          type: format === "png" ? "png" : "jpeg",
          quality: format === "png" ? undefined : req.screenshot.quality,
          timeout: remaining(),
          animations: "disabled",
        });
        const size = req.screenshot.fullPage
          ? await page.evaluate(() => ({
              width: document.documentElement.scrollWidth,
              height: document.documentElement.scrollHeight,
            }))
          : viewport;
        // Chromium only emits png/jpeg; WebP is transcoded (typically ~30% smaller than jpeg).
        const bytes =
          format === "webp"
            ? await sharp(raw).webp({ quality: req.screenshot.quality }).toBuffer()
            : raw;
        result.screenshot = {
          base64: bytes.toString("base64"),
          width: size.width,
          height: size.height,
          format,
        };
      }

      if (req.evaluate === "styleguide") {
        result.evaluated = await page.evaluate(styleguideProbe);
      }
      return result;
    } finally {
      await context?.close().catch(() => {});
      this.release();
    }
  }

  async close() {
    const b = this.browser;
    this.browser = null;
    await b?.then((x) => x.close()).catch(() => {});
  }
}

function toPlaywrightProxy(raw: string) {
  const u = new URL(raw);
  return {
    server: `${u.protocol}//${u.host}`,
    username: u.username ? decodeURIComponent(u.username) : undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
  };
}

async function runActions(page: Page, req: RenderRequest, remaining: () => number) {
  for (const action of req.actions ?? []) {
    const timeout = Math.min(10_000, remaining());
    switch (action.type) {
      case "wait":
        await page.waitForTimeout(Math.min(action.ms, remaining()));
        break;
      case "waitForSelector":
        await page.waitForSelector(action.selector, { timeout });
        break;
      case "click":
        await page.click(action.selector, { timeout });
        await page.waitForLoadState("domcontentloaded", { timeout }).catch(() => {});
        break;
      case "type":
        await page.fill(action.selector, action.text, { timeout });
        break;
      case "press":
        await page.keyboard.press(action.key);
        break;
      case "scroll":
        await page.mouse.wheel(0, action.direction === "up" ? -1_000 : 1_000);
        await page.waitForTimeout(250);
        break;
    }
  }
}

async function autoScroll(page: Page, budgetMs: number) {
  const until = Date.now() + Math.min(budgetMs, 8_000);
  for (let i = 0; i < 30 && Date.now() < until; i++) {
    const done = await page.evaluate(() => {
      window.scrollBy(0, window.innerHeight);
      return window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4;
    });
    if (done) break;
    await page.waitForTimeout(150);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
}
