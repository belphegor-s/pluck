import { crawlPages, crawls, monitorChanges, monitors, newId, usageEvents } from "@pluck/db";
import { type CrawlJob, type Monitor, PluckError, scrapeCost } from "@pluck/shared";
import { and, desc, eq, gt, gte, lt, sql } from "drizzle-orm";
import { handler } from "../handler.js";

/* ------------------------------------------------------------------ crawl */

const toCrawlJob = (row: typeof crawls.$inferSelect): CrawlJob => ({
  id: row.id,
  status: row.status,
  url: row.url,
  total: row.total,
  completed: row.completed,
  failed: row.failed,
  creditsUsed: row.creditsUsed,
  error: row.error,
  createdAt: row.createdAt.toISOString(),
  finishedAt: row.finishedAt?.toISOString() ?? null,
});

export const crawlStart = handler("crawlStart", {
  // Pages are charged by the worker as they complete; require enough for the first page.
  estimate: () => 0,
  target: (i) => i.url,
  async run({ s, caller }, req) {
    const minimum = scrapeCost({ browser: req.scrapeOptions.render === "always" });
    if (s.credits.enabled && ((await s.credits.balance(caller.userId)) ?? 0) < minimum) {
      throw new PluckError("insufficient_credits", "Not enough credits to start a crawl.");
    }
    const [row] = await s.db
      .insert(crawls)
      .values({ id: newId("crawl"), userId: caller.userId, url: req.url, options: req })
      .returning();
    await s.queues.crawl.add("crawl", { crawlId: row!.id }, { jobId: row!.id });
    return { data: toCrawlJob(row!), credits: 0, status: 202 };
  },
});

async function ownCrawl(
  s: Parameters<(typeof crawlStart)["run"]>[0]["s"],
  userId: string,
  id: string,
) {
  const [row] = await s.db
    .select()
    .from(crawls)
    .where(and(eq(crawls.id, id), eq(crawls.userId, userId)));
  if (!row) throw new PluckError("not_found", "Crawl not found.");
  return row;
}

export const crawlGet = handler("crawlGet", {
  estimate: () => 0,
  async run({ s, caller }, { id, cursor, limit }) {
    const row = await ownCrawl(s, caller.userId, id);
    const after = cursor ? Number(cursor) : 0;
    const pages = await s.db
      .select()
      .from(crawlPages)
      .where(and(eq(crawlPages.crawlId, id), gt(crawlPages.id, Number.isFinite(after) ? after : 0)))
      .orderBy(crawlPages.id)
      .limit(limit + 1);
    const hasMore = pages.length > limit;
    const slice = pages.slice(0, limit);
    return {
      data: {
        ...toCrawlJob(row),
        pages: slice.map((p) => ({
          ...((p.result as object | null) ?? {}),
          url: p.url,
          depth: p.depth,
          error: p.error,
          metadata: ((p.result as { metadata?: never } | null)?.metadata ?? null) as never,
        })),
        nextCursor: hasMore ? String(slice.at(-1)!.id) : null,
      },
      credits: 0,
    };
  },
});

export const crawlCancel = handler("crawlCancel", {
  estimate: () => 0,
  async run({ s, caller }, { id }) {
    await ownCrawl(s, caller.userId, id);
    const [row] = await s.db
      .update(crawls)
      .set({
        status: sql`CASE WHEN ${crawls.status} IN ('queued','running') THEN 'cancelled'::job_status ELSE ${crawls.status} END`,
        finishedAt: sql`COALESCE(${crawls.finishedAt}, now())`,
      })
      .where(eq(crawls.id, id))
      .returning();
    return { data: toCrawlJob(row!), credits: 0 };
  },
});

/* --------------------------------------------------------------- monitors */

const toMonitor = (m: typeof monitors.$inferSelect): Monitor => ({
  id: m.id,
  name: m.name,
  type: m.type,
  url: m.url,
  intervalMinutes: m.intervalMinutes,
  webhook: m.webhook,
  selector: m.selector,
  active: m.active,
  lastCheckedAt: m.lastCheckedAt?.toISOString() ?? null,
  lastChangedAt: m.lastChangedAt?.toISOString() ?? null,
  nextRunAt: m.nextRunAt.toISOString(),
  createdAt: m.createdAt.toISOString(),
});

const MAX_MONITORS = 1_000;

export const monitorCreate = handler("monitorCreate", {
  estimate: () => 0,
  target: (i) => i.url,
  async run({ s, caller }, req) {
    if (req.type === "extract" && !req.schema && !req.prompt) {
      throw new PluckError("bad_request", "Extract monitors need a `schema` or `prompt`.");
    }
    // Every check is charged, so frequency polices itself; the floor only
    // keeps one account from hammering a target on our behalf.
    const minInterval = s.config.BILLING_ENABLED ? 15 : 5;
    if (req.intervalMinutes < minInterval) {
      throw new PluckError(
        "bad_request",
        `The minimum interval on this instance is ${minInterval} minutes.`,
      );
    }
    const [{ count } = { count: 0 }] = await s.db
      .select({ count: sql<number>`count(*)::int` })
      .from(monitors)
      .where(eq(monitors.userId, caller.userId));
    if (count >= MAX_MONITORS)
      throw new PluckError("forbidden", `Accounts are limited to ${MAX_MONITORS} monitors.`);

    const [row] = await s.db
      .insert(monitors)
      .values({
        id: newId("mon"),
        userId: caller.userId,
        name: req.name,
        type: req.type,
        url: req.url,
        intervalMinutes: req.intervalMinutes,
        webhook: req.webhook,
        selector: req.selector,
        schema: req.schema,
        prompt: req.prompt,
        proxy: req.proxy,
        active: req.active,
        nextRunAt: new Date(),
      })
      .returning();
    if (row!.active) await s.queues.monitor.add("check", { monitorId: row!.id });
    return { data: toMonitor(row!), credits: 0, status: 201 };
  },
});

async function ownMonitor(
  s: Parameters<(typeof monitorCreate)["run"]>[0]["s"],
  userId: string,
  id: string,
) {
  const [row] = await s.db
    .select()
    .from(monitors)
    .where(and(eq(monitors.id, id), eq(monitors.userId, userId)));
  if (!row) throw new PluckError("not_found", "Monitor not found.");
  return row;
}

export const monitorList = handler("monitorList", {
  estimate: () => 0,
  async run({ s, caller }, { cursor, limit }) {
    const rows = await s.db
      .select()
      .from(monitors)
      .where(and(eq(monitors.userId, caller.userId), cursor ? lt(monitors.id, cursor) : undefined))
      .orderBy(desc(monitors.id))
      .limit(limit + 1);
    const slice = rows.slice(0, limit);
    return {
      data: {
        monitors: slice.map(toMonitor),
        nextCursor: rows.length > limit ? slice.at(-1)!.id : null,
      },
      credits: 0,
    };
  },
});

export const monitorGet = handler("monitorGet", {
  estimate: () => 0,
  async run({ s, caller }, { id }) {
    return { data: toMonitor(await ownMonitor(s, caller.userId, id)), credits: 0 };
  },
});

export const monitorUpdate = handler("monitorUpdate", {
  estimate: () => 0,
  async run({ s, caller }, { id, ...patch }) {
    await ownMonitor(s, caller.userId, id);
    const [row] = await s.db
      .update(monitors)
      .set({ ...patch, ...(patch.active ? { consecutiveFailures: 0 } : {}) })
      .where(eq(monitors.id, id))
      .returning();
    return { data: toMonitor(row!), credits: 0 };
  },
});

export const monitorDelete = handler("monitorDelete", {
  estimate: () => 0,
  async run({ s, caller }, { id }) {
    await ownMonitor(s, caller.userId, id);
    await s.db.delete(monitors).where(eq(monitors.id, id));
    return { data: { deleted: true as const }, credits: 0 };
  },
});

export const monitorChangesList = handler("monitorChanges", {
  estimate: () => 0,
  async run({ s, caller }, { id, cursor, limit }) {
    await ownMonitor(s, caller.userId, id);
    const rows = await s.db
      .select()
      .from(monitorChanges)
      .where(
        and(eq(monitorChanges.monitorId, id), cursor ? lt(monitorChanges.id, cursor) : undefined),
      )
      .orderBy(desc(monitorChanges.id))
      .limit(limit + 1);
    const slice = rows.slice(0, limit);
    return {
      data: {
        changes: slice.map((c) => ({
          id: c.id,
          monitorId: c.monitorId,
          detectedAt: c.detectedAt.toISOString(),
          summary: c.summary,
          diff: c.diff,
          added: c.added ?? undefined,
          removed: c.removed ?? undefined,
        })),
        nextCursor: rows.length > limit ? slice.at(-1)!.id : null,
      },
      credits: 0,
    };
  },
});

/* ------------------------------------------------------------------ usage */

export const usage = handler("usage", {
  estimate: () => 0,
  async run({ s, caller }, { days }) {
    const from = new Date(Date.now() - days * 86_400_000);
    const where = and(eq(usageEvents.userId, caller.userId), gte(usageEvents.createdAt, from));
    const [balance, byEndpoint, daily] = await Promise.all([
      s.credits.balance(caller.userId),
      s.db
        .select({
          endpoint: usageEvents.endpoint,
          requests: sql<number>`count(*)::int`,
          credits: sql<number>`coalesce(sum(${usageEvents.credits}),0)::int`,
        })
        .from(usageEvents)
        .where(where)
        .groupBy(usageEvents.endpoint)
        .orderBy(desc(sql`3`)),
      s.db
        .select({
          date: sql<string>`to_char(date_trunc('day', ${usageEvents.createdAt}), 'YYYY-MM-DD')`,
          requests: sql<number>`count(*)::int`,
          credits: sql<number>`coalesce(sum(${usageEvents.credits}),0)::int`,
        })
        .from(usageEvents)
        .where(where)
        .groupBy(sql`1`)
        .orderBy(sql`1`),
    ]);
    return {
      data: {
        balance,
        period: { from: from.toISOString(), to: new Date().toISOString() },
        totalCredits: byEndpoint.reduce((n, r) => n + r.credits, 0),
        totalRequests: byEndpoint.reduce((n, r) => n + r.requests, 0),
        byEndpoint,
        daily,
      },
      credits: 0,
    };
  },
});
