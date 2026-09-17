import {
  type HttpClient,
  isLikelyPage,
  normaliseUrl,
  pathMatcher,
  type RobotsCache,
  readSitemaps,
  Scraper,
  sameSite,
} from "@pluck/core";
import { crawlPages, crawls, type Database, users } from "@pluck/db";
import type { Credits, LlmResolver, Logger, Queues, UsageRecorder } from "@pluck/runtime";
import { type CrawlRequest, isPluckError, scrapeCost } from "@pluck/shared";
import { eq, sql } from "drizzle-orm";
import type { BrowserPool } from "./browser.js";

export interface CrawlDeps {
  db: Database;
  http: HttpClient;
  robots: RobotsCache;
  browser: BrowserPool;
  credits: Credits;
  usage: UsageRecorder;
  llm: LlmResolver;
  queues: Queues;
  log: Logger;
  allowPrivateNetwork: boolean;
  concurrency: number;
}

interface Frontier {
  url: string;
  depth: number;
}

export async function runCrawl(deps: CrawlDeps, crawlId: string): Promise<void> {
  const { db, log } = deps;
  const [crawl] = await db.select().from(crawls).where(eq(crawls.id, crawlId));
  if (!crawl || crawl.status === "cancelled" || crawl.status === "completed") return;

  const req = crawl.options as CrawlRequest;
  const started = Date.now();
  await db
    .update(crawls)
    .set({ status: "running", startedAt: crawl.startedAt ?? new Date() })
    .where(eq(crawls.id, crawlId));
  await emit(deps, crawl.userId, req, "started", { id: crawlId, url: req.url });

  const scraper = new Scraper({
    http: deps.http,
    robots: deps.robots,
    renderer: deps.browser,
    extractor: req.scrapeOptions.formats.includes("json") ? deps.llm.tasks(crawl.userId) : null,
    allowPrivateNetwork: deps.allowPrivateNetwork,
  });
  const matches = pathMatcher(req.includePaths, req.excludePaths);
  const wantsLinks = req.scrapeOptions.formats.includes("links");
  const inScope = (url: string) =>
    isLikelyPage(url) &&
    (req.allowExternal || sameSite(url, req.url, req.allowSubdomains)) &&
    matches(url);

  // Resume support: pages stored by a previous attempt of this job are skipped.
  const seen = new Set<string>();
  const done = await db
    .select({ url: crawlPages.url })
    .from(crawlPages)
    .where(eq(crawlPages.crawlId, crawlId));
  for (const p of done) seen.add(p.url);

  const queue: Frontier[] = [];
  const enqueue = (raw: string, depth: number) => {
    const url = normaliseUrl(raw, { dropQuery: req.ignoreQueryParams });
    if (!url || seen.has(url) || depth > req.maxDepth || !inScope(url)) return;
    if (seen.size >= req.limit) return;
    seen.add(url);
    queue.push({ url, depth });
  };

  const root = normaliseUrl(req.url, { dropQuery: req.ignoreQueryParams }) ?? req.url;
  if (!seen.has(root)) {
    seen.add(root);
    queue.push({ url: root, depth: 0 });
  }
  if (req.useSitemap) {
    const { entries } = await readSitemaps(deps.http, deps.robots, new URL(req.url).origin, {
      limit: req.limit * 2,
    }).catch(() => ({ entries: [] }));
    for (const e of entries) enqueue(e.url, 1);
  }

  let completed = crawl.completed;
  let failed = crawl.failed;
  let creditsUsed = crawl.creditsUsed;
  let stopReason: string | null = null;
  let lastFlush = Date.now();
  let lastCancelCheck = Date.now();

  const flush = async (force = false) => {
    if (!force && Date.now() - lastFlush < 1_000) return;
    lastFlush = Date.now();
    await db
      .update(crawls)
      .set({ completed, failed, creditsUsed, total: Math.max(seen.size, completed + failed) })
      .where(eq(crawls.id, crawlId));
  };

  const worker = async () => {
    while (!stopReason) {
      const next = queue.shift();
      if (!next) return;

      if (Date.now() - lastCancelCheck > 3_000) {
        lastCancelCheck = Date.now();
        const [row] = await db
          .select({ status: crawls.status })
          .from(crawls)
          .where(eq(crawls.id, crawlId));
        if (row?.status === "cancelled") {
          stopReason = "cancelled";
          return;
        }
      }

      try {
        const { result, usage } = await scraper.scrape({
          ...req.scrapeOptions,
          formats: wantsLinks ? req.scrapeOptions.formats : [...req.scrapeOptions.formats, "links"],
          url: next.url,
        });
        const cost = scrapeCost(usage);
        try {
          await deps.credits.reserve(crawl.userId, cost);
        } catch {
          stopReason = "insufficient_credits";
          return;
        }
        creditsUsed += cost;
        completed++;

        const links = result.links ?? [];
        if (!wantsLinks) delete result.links;
        await db.insert(crawlPages).values({ crawlId, url: next.url, depth: next.depth, result });
        if (next.depth < req.maxDepth) for (const link of links) enqueue(link, next.depth + 1);
        if (req.webhook?.events.includes("page")) {
          await emit(deps, crawl.userId, req, "page", {
            id: crawlId,
            url: next.url,
            depth: next.depth,
            data: result,
          });
        }
      } catch (err) {
        failed++;
        const message = isPluckError(err) ? err.message : "Failed to scrape page.";
        await db
          .insert(crawlPages)
          .values({ crawlId, url: next.url, depth: next.depth, error: message });
      }
      await flush();
    }
  };

  // Workers idle out when the queue drains; relaunch while links keep arriving.
  while (queue.length && !stopReason) {
    await Promise.all(Array.from({ length: Math.min(req.concurrency, deps.concurrency) }, worker));
  }
  await flush(true);

  const status =
    stopReason === "cancelled"
      ? "cancelled"
      : stopReason === "insufficient_credits"
        ? "failed"
        : "completed";
  const error = stopReason === "insufficient_credits" ? "Stopped: out of credits." : null;
  await db
    .update(crawls)
    .set({
      status: sql`CASE WHEN ${crawls.status} = 'cancelled' THEN 'cancelled'::job_status ELSE ${status}::job_status END`,
      error,
      finishedAt: new Date(),
    })
    .where(eq(crawls.id, crawlId));

  deps.usage.record({
    userId: crawl.userId,
    apiKeyId: null,
    requestId: crawlId,
    endpoint: "crawl",
    status: status === "failed" ? 402 : 200,
    credits: creditsUsed - crawl.creditsUsed,
    durationMs: Date.now() - started,
    cached: false,
    target: req.url,
  });
  log.info({ crawlId, completed, failed, creditsUsed, status }, "crawl finished");
  await emit(deps, crawl.userId, req, status === "completed" ? "completed" : "failed", {
    id: crawlId,
    status,
    completed,
    failed,
    creditsUsed,
    error,
  });
}

async function emit(
  deps: CrawlDeps,
  userId: string,
  req: CrawlRequest,
  event: "started" | "page" | "completed" | "failed",
  payload: unknown,
) {
  if (!req.webhook || !req.webhook.events.includes(event)) return;
  const [user] = await deps.db
    .select({ secret: users.webhookSecret })
    .from(users)
    .where(eq(users.id, userId));
  if (!user) return;
  await deps.queues.webhook.add(`crawl.${event}`, {
    url: req.webhook.url,
    secret: user.secret,
    event: `crawl.${event}`,
    payload,
  });
}
