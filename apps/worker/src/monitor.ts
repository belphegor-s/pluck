import {
  diffSets,
  diffText,
  type HttpClient,
  type RobotsCache,
  readSitemaps,
  Scraper,
  sha256,
} from "@pluck/core";
import { type Database, monitorChanges, monitors, newId } from "@pluck/db";
import {
  type Credits,
  enqueueWebhook,
  type LlmResolver,
  type Logger,
  type ProxyDirectory,
  type Queues,
  type UsageRecorder,
} from "@pluck/runtime";
import { credits as creditPrices, isPluckError, scrapeCost } from "@pluck/shared";
import { eq, sql } from "drizzle-orm";
import type { BrowserPool } from "./browser.js";

export interface MonitorDeps {
  db: Database;
  http: HttpClient;
  robots: RobotsCache;
  browser: BrowserPool;
  credits: Credits;
  usage: UsageRecorder;
  llm: LlmResolver;
  queues: Queues;
  proxies?: ProxyDirectory;
  log: Logger;
  allowPrivateNetwork: boolean;
}

const MAX_FAILURES = 10;

/** Claims due monitors with SKIP LOCKED so any number of schedulers can run safely. */
export async function scheduleDueMonitors(deps: MonitorDeps): Promise<number> {
  const due = await deps.db.execute<{ id: string }>(sql`
    UPDATE ${monitors} SET next_run_at = now() + (interval_minutes * interval '1 minute')
    WHERE id IN (
      SELECT id FROM ${monitors}
      WHERE active AND next_run_at <= now()
      ORDER BY next_run_at
      LIMIT 1000
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id`);
  const bucket = Math.floor(Date.now() / 60_000);
  if (due.length) {
    await deps.queues.monitor.addBulk(
      due.map((r) => ({
        name: "check",
        data: { monitorId: r.id },
        opts: { jobId: `mon-${r.id}-${bucket}` },
      })),
    );
  }
  return due.length;
}

export async function checkMonitor(deps: MonitorDeps, monitorId: string): Promise<void> {
  const { db } = deps;
  const [m] = await db.select().from(monitors).where(eq(monitors.id, monitorId));
  if (!m || !m.active) return;
  const started = Date.now();
  const proxy = m.proxy as "auto" | "none" | "datacenter" | "residential";

  try {
    let snapshot: string;
    let cost = creditPrices.monitorCheck;

    if (m.type === "sitemap") {
      const { entries } = await readSitemaps(deps.http, deps.robots, new URL(m.url).origin, {
        limit: 50_000,
      });
      snapshot = JSON.stringify(entries.map((e) => e.url).sort());
      cost += creditPrices.map;
    } else {
      const scraper = new Scraper({
        http: deps.http,
        robots: deps.robots,
        renderer: deps.browser.background,
        userId: m.userId,
        proxies: await deps.proxies?.forUser(m.userId),
        extractor: m.type === "extract" ? deps.llm.tasks(m.userId) : null,
        allowPrivateNetwork: deps.allowPrivateNetwork,
      });
      const { result, usage } = await scraper.scrape({
        url: m.url,
        formats: m.type === "extract" ? ["json"] : ["markdown"],
        includeTags: m.selector ? [m.selector] : undefined,
        jsonOptions:
          m.type === "extract"
            ? {
                schema: (m.schema as Record<string, unknown>) ?? undefined,
                prompt: m.prompt ?? undefined,
              }
            : undefined,
        onlyMainContent: !m.selector,
        render: "auto",
        proxy,
        timeout: 45_000,
        maxAge: 0,
        blockAds: true,
        respectRobots: true,
        mobile: false,
      });
      snapshot = m.type === "extract" ? stableJson(result.json) : (result.markdown ?? "");
      cost += scrapeCost(usage);
    }

    try {
      await deps.credits.reserve(m.userId, cost);
    } catch {
      await db
        .update(monitors)
        .set({ active: false, lastError: "Paused: out of credits." })
        .where(eq(monitors.id, m.id));
      return;
    }

    const hash = sha256(snapshot);
    const changed = m.snapshotHash !== null && m.snapshotHash !== hash;
    const now = new Date();

    if (changed) {
      const change =
        m.type === "sitemap"
          ? (() => {
              const d = diffSets(
                JSON.parse(m.snapshot ?? "[]") as string[],
                JSON.parse(snapshot) as string[],
              );
              return {
                summary: `${d.added.length} URL(s) added, ${d.removed.length} removed`,
                diff: null,
                added: d.added,
                removed: d.removed,
              };
            })()
          : (() => {
              const d = diffText(
                m.snapshot ?? "",
                snapshot,
                m.type === "extract" ? "data.json" : "page.md",
              );
              return {
                summary: d?.summary ?? "Content changed",
                diff: d?.diff ?? null,
                added: null,
                removed: null,
              };
            })();

      const id = newId("chg");
      await db.insert(monitorChanges).values({ id, monitorId: m.id, ...change, detectedAt: now });
      if (m.webhook) {
        await enqueueWebhook(db, deps.queues, {
          userId: m.userId,
          url: m.webhook,
          event: "monitor.changed",
          payload: {
            monitorId: m.id,
            changeId: id,
            url: m.url,
            type: m.type,
            detectedAt: now.toISOString(),
            ...change,
          },
        });
      }
    }

    await db
      .update(monitors)
      .set({
        // Sitemaps can be large; keep only what diffs need.
        snapshot: snapshot.length > 5_000_000 ? snapshot.slice(0, 5_000_000) : snapshot,
        snapshotHash: hash,
        lastCheckedAt: now,
        lastChangedAt: changed ? now : m.lastChangedAt,
        consecutiveFailures: 0,
        lastError: null,
      })
      .where(eq(monitors.id, m.id));

    deps.usage.record({
      userId: m.userId,
      apiKeyId: null,
      requestId: `${m.id}:${started}`,
      endpoint: "monitorCheck",
      status: 200,
      credits: cost,
      durationMs: Date.now() - started,
      cached: false,
      target: m.url,
    });
  } catch (err) {
    const failures = m.consecutiveFailures + 1;
    await db
      .update(monitors)
      .set({
        consecutiveFailures: failures,
        lastError: isPluckError(err) ? err.message : "Check failed.",
        lastCheckedAt: new Date(),
        active: failures < MAX_FAILURES,
      })
      .where(eq(monitors.id, m.id));
    deps.log.warn(
      { monitorId: m.id, failures, err: isPluckError(err) ? err.message : err },
      "monitor check failed",
    );
  }
}

function stableJson(value: unknown): string {
  const sort = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(sort)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.entries(v)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, x]) => [k, sort(x)]),
          )
        : v;
  return JSON.stringify(sort(value), null, 2);
}
