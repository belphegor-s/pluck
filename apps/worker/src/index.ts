import { credentialFromEnv } from "@pluck/ai";
import { HttpClient, ProxyPool, RobotsCache, assertPublicUrl, createSafeLookup } from "@pluck/core";
import { createDb, crawls, monitorChanges, usageEvents } from "@pluck/db";
import {
  type CrawlJobData,
  Credits,
  LlmResolver,
  type MonitorJobData,
  QUEUES,
  UsageRecorder,
  type WebhookJobData,
  createLogger,
  createQueues,
  createRedis,
  encodeRenderError,
  loadConfig,
  signWebhook,
} from "@pluck/runtime";
import type { RenderRequest } from "@pluck/core";
import { type ConnectionOptions, Worker } from "bullmq";
import { lt, sql } from "drizzle-orm";
import { Agent, request } from "undici";
import { BrowserPool } from "./browser.js";
import { runCrawl } from "./crawl.js";
import { checkMonitor, scheduleDueMonitors } from "./monitor.js";

const config = loadConfig();
const log = createLogger(config, "worker");
const roles = new Set((process.env.WORKER_ROLES ?? "render,crawl,monitor,webhook,maintenance").split(",").map((r) => r.trim()));

const db = createDb(config.DATABASE_URL, { max: config.DATABASE_POOL_SIZE });
const redis = createRedis(config.REDIS_URL, { forQueue: true });
const connection = redis as unknown as ConnectionOptions;
const queues = createQueues(redis);
const proxies = ProxyPool.fromEnv(config);
const http = new HttpClient({ proxies, allowPrivateNetwork: config.ALLOW_PRIVATE_NETWORK });
const robots = new RobotsCache(http);
const browser = new BrowserPool({
  concurrency: config.BROWSER_CONCURRENCY,
  proxies,
  allowPrivateNetwork: config.ALLOW_PRIVATE_NETWORK,
  executablePath: process.env.CHROMIUM_PATH || undefined,
  log,
});
const credits = new Credits(db, config.BILLING_ENABLED);
const usage = new UsageRecorder(db, log);
const llm = new LlmResolver(db, config, credentialFromEnv(config));
const deps = { db, http, robots, browser, credits, usage, llm, queues, log, allowPrivateNetwork: config.ALLOW_PRIVATE_NETWORK };

const workers: Worker[] = [];

if (roles.has("render")) {
  workers.push(
    new Worker<RenderRequest>(
      QUEUES.render,
      async (job) => {
        try {
          return await browser.render(job.data);
        } catch (err) {
          // Returned, not thrown: the API needs the typed error, and failed jobs would retry.
          return encodeRenderError(err);
        }
      },
      { connection, concurrency: config.BROWSER_CONCURRENCY * 2, lockDuration: 180_000 },
    ),
  );
}

if (roles.has("crawl")) {
  workers.push(
    new Worker<CrawlJobData>(QUEUES.crawl, (job) => runCrawl({ ...deps, concurrency: config.BROWSER_CONCURRENCY * 2 }, job.data.crawlId), {
      connection,
      concurrency: config.CRAWL_CONCURRENCY,
      lockDuration: 600_000,
    }),
  );
}

if (roles.has("monitor")) {
  workers.push(
    new Worker<MonitorJobData>(QUEUES.monitor, (job) => checkMonitor(deps, job.data.monitorId), {
      connection,
      concurrency: config.BROWSER_CONCURRENCY * 2,
      lockDuration: 180_000,
    }),
  );
}

if (roles.has("webhook")) {
  const safeAgent = new Agent({ connect: { lookup: createSafeLookup(config.ALLOW_PRIVATE_NETWORK), timeout: 10_000 } });
  workers.push(
    new Worker<WebhookJobData>(
      QUEUES.webhook,
      async (job) => {
        const { url, secret, event, payload } = job.data;
        assertPublicUrl(url, config.ALLOW_PRIVATE_NETWORK);
        const body = JSON.stringify({ event, deliveredAt: new Date().toISOString(), data: payload });
        const res = await request(url, {
          method: "POST",
          dispatcher: safeAgent,
          headers: {
            "content-type": "application/json",
            "user-agent": "Pluck-Webhooks/1.0",
            "pluck-event": event,
            "pluck-delivery": job.id ?? "",
            "pluck-signature": signWebhook(secret, body),
          },
          body,
          headersTimeout: 15_000,
          bodyTimeout: 15_000,
        });
        await res.body.dump();
        if (res.statusCode >= 300) throw new Error(`Webhook responded with HTTP ${res.statusCode}`);
      },
      { connection, concurrency: 50 },
    ),
  );
}

if (roles.has("maintenance")) {
  await queues.maintenance.upsertJobScheduler("monitors", { every: 60_000 }, { name: "monitors" });
  await queues.maintenance.upsertJobScheduler("retention", { pattern: "17 3 * * *" }, { name: "retention" });
  workers.push(
    new Worker(
      QUEUES.maintenance,
      async (job) => {
        if (job.name === "monitors") {
          const n = await scheduleDueMonitors(deps);
          if (n) log.debug({ scheduled: n }, "monitors scheduled");
        } else if (job.name === "retention") {
          const day = 86_400_000;
          await db.delete(crawls).where(lt(crawls.createdAt, new Date(Date.now() - 7 * day)));
          await db.delete(monitorChanges).where(lt(monitorChanges.detectedAt, new Date(Date.now() - 90 * day)));
          await db.delete(usageEvents).where(lt(usageEvents.createdAt, new Date(Date.now() - 400 * day)));
          await db.execute(sql`DELETE FROM brand WHERE updated_at < now() - interval '90 days'`);
          log.info("retention cleanup done");
        }
      },
      { connection, concurrency: 1 },
    ),
  );
}

for (const w of workers) {
  w.on("failed", (job, err) => log.warn({ queue: w.name, jobId: job?.id, err: err.message }, "job failed"));
  w.on("error", (err) => log.error({ queue: w.name, err }, "worker error"));
}
log.info({ roles: [...roles], browserConcurrency: config.BROWSER_CONCURRENCY }, "pluck worker started");

let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    if (stopping) return;
    stopping = true;
    log.info({ signal }, "draining workers");
    setTimeout(() => process.exit(1), 60_000).unref();
    await Promise.allSettled(workers.map((w) => w.close()));
    await Promise.allSettled([usage.close(), browser.close(), http.close(), ...Object.values(queues).map((q) => q.close())]);
    redis.disconnect();
    await db.$client.end({ timeout: 5 });
    process.exit(0);
  });
}
