import { credentialFromEnv } from "@pluck/ai";
import type { RenderRequest } from "@pluck/core";
import { assertPublicUrl, createSafeLookup, HttpClient, ProxyPool, RobotsCache } from "@pluck/core";
import {
  crawls,
  createDb,
  members,
  monitorChanges,
  organizations,
  usageEvents,
  users,
  webhookDeliveries,
} from "@pluck/db";
import {
  attemptDelivery,
  type CrawlJobData,
  Credits,
  createErrorReporter,
  createLogger,
  createMailer,
  createQueues,
  createRedis,
  encodeRenderError,
  installProcessHandlers,
  LlmResolver,
  loadConfig,
  type MonitorJobData,
  ProxyDirectory,
  QUEUES,
  UsageRecorder,
  type WebhookJobData,
} from "@pluck/runtime";
import { BRAND, OWNER_USER_ID } from "@pluck/shared";
import { type ConnectionOptions, Worker } from "bullmq";
import { and, eq, inArray, isNull, lt, ne, sql } from "drizzle-orm";
import { Agent } from "undici";
import { BrowserPool } from "./browser.js";
import { runCrawl } from "./crawl.js";
import { checkMonitor, scheduleDueMonitors } from "./monitor.js";

const config = loadConfig();
const log = createLogger(config, "worker");
const errors = createErrorReporter(config, "worker", log);
const roles = new Set(
  (process.env.WORKER_ROLES ?? "render,crawl,monitor,webhook,maintenance")
    .split(",")
    .map((r) => r.trim()),
);

const db = createDb(config.DATABASE_URL, { max: config.DATABASE_POOL_SIZE });
const redis = createRedis(config.REDIS_URL, { forQueue: true });
const connection = redis as unknown as ConnectionOptions;
const queues = createQueues(redis);
const proxies = ProxyPool.fromEnv(config);
const http = new HttpClient({ proxies, allowPrivateNetwork: config.ALLOW_PRIVATE_NETWORK });
const robots = new RobotsCache(http);
const proxyDirectory = new ProxyDirectory(db, config, proxies);
const browser = new BrowserPool({
  concurrency: config.BROWSER_CONCURRENCY,
  proxies,
  allowPrivateNetwork: config.ALLOW_PRIVATE_NETWORK,
  executablePath: process.env.CHROMIUM_PATH || undefined,
  log,
  // A render job carries a user id; the credentials are read here.
  poolFor: (orgId) => proxyDirectory.forOrg(orgId),
});
const mailer = createMailer(config);
const credits = new Credits(db, config.BILLING_ENABLED);
const usage = new UsageRecorder(db, log);
const llm = new LlmResolver(db, config, credentialFromEnv(config));
const deps = {
  db,
  http,
  robots,
  browser,
  credits,
  usage,
  llm,
  queues,
  proxies: proxyDirectory,
  log,
  allowPrivateNetwork: config.ALLOW_PRIVATE_NETWORK,
};

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
    new Worker<CrawlJobData>(
      QUEUES.crawl,
      (job) => runCrawl({ ...deps, concurrency: config.BROWSER_CONCURRENCY * 2 }, job.data.crawlId),
      {
        connection,
        concurrency: config.CRAWL_CONCURRENCY,
        lockDuration: 600_000,
      },
    ),
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
  const safeAgent = new Agent({
    connect: { lookup: createSafeLookup(config.ALLOW_PRIVATE_NETWORK), timeout: 10_000 },
  });
  workers.push(
    new Worker<WebhookJobData>(
      QUEUES.webhook,
      async (job) => {
        const attempts = job.opts.attempts ?? 1;
        const result = await attemptDelivery(db, safeAgent, job.data.deliveryId, {
          // `attemptsMade` counts finished attempts, so this one is the last
          // when it is the attempts-th.
          final: job.attemptsMade + 1 >= attempts,
          assertTarget: (url) => assertPublicUrl(url, config.ALLOW_PRIVATE_NETWORK),
        });
        // Throwing is what makes the queue retry; the outcome is already recorded.
        if (!result.ok) throw new Error(result.error ?? "Webhook delivery failed");
      },
      { connection, concurrency: 50 },
    ),
  );
}

/**
 * A backlog means either a stuck worker or a traffic spike; both want a human.
 * Depth alone is not enough — a busy queue drains — so age of the oldest
 * waiting job is what decides.
 */
async function alertOnBacklog() {
  for (const [name, queue] of Object.entries(queues)) {
    if (name === "maintenance") continue;
    const waiting = await queue.getWaitingCount();
    if (waiting < 50) continue;
    const [oldest] = await queue.getWaiting(0, 0);
    const ageMinutes = oldest ? Math.round((Date.now() - oldest.timestamp) / 60_000) : 0;
    if (ageMinutes >= 10) errors.alert(`${name} queue is backed up`, { waiting, ageMinutes });
  }
}

/**
 * Warns the owners and admins of each workspace about to run out of credits.
 *
 * `lowBalanceNotifiedAt` is cleared whenever credits are granted, so topping up
 * re-arms the warning and nobody gets the same email twice for one dip.
 */
async function warnLowBalances() {
  if (!config.BILLING_ENABLED || !mailer.enabled) return;
  const low = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      personal: organizations.personal,
      credits: organizations.credits,
    })
    .from(organizations)
    .where(
      and(
        lt(organizations.credits, config.LOW_BALANCE_CREDITS),
        isNull(organizations.lowBalanceNotifiedAt),
        // The self-hosted operator's own workspace is not a customer.
        ne(organizations.id, OWNER_USER_ID),
      ),
    )
    .limit(200);

  for (const org of low) {
    const recipients = await db
      .select({ email: users.email, name: users.name })
      .from(members)
      .innerJoin(users, eq(users.id, members.userId))
      .where(and(eq(members.orgId, org.id), inArray(members.role, ["owner", "admin"])));
    const where = org.personal ? "Your account" : `The ${org.name} workspace`;
    for (const person of recipients) {
      const sent = await mailer.send({
        to: person.email,
        subject: `${org.personal ? "Your" : org.name} ${BRAND.name} balance is running low`,
        text: [
          `Hi ${person.name || "there"},`,
          "",
          `${where} has ${org.credits.toLocaleString("en-US")} credits left, so calls will start failing with insufficient_credits once it reaches zero.`,
          "",
          `Top up: ${config.PUBLIC_WEB_URL}/dashboard/billing`,
          "",
          "Credits never expire and there is no subscription — you only pay for what you use.",
        ].join("\n"),
      });
      if (!sent.ok) log.warn({ orgId: org.id, err: sent.error }, "low balance email failed");
    }
    // Mark it either way: a broken mailbox should not mean a mail every six hours.
    await db
      .update(organizations)
      .set({ lowBalanceNotifiedAt: new Date() })
      .where(eq(organizations.id, org.id));
  }
  if (low.length) log.info({ warned: low.length }, "low balance warnings sent");
}

if (roles.has("maintenance")) {
  await queues.maintenance.upsertJobScheduler("monitors", { every: 60_000 }, { name: "monitors" });
  await queues.maintenance.upsertJobScheduler(
    "balances",
    { pattern: "23 */6 * * *" },
    { name: "balances" },
  );
  await queues.maintenance.upsertJobScheduler(
    "retention",
    { pattern: "17 3 * * *" },
    { name: "retention" },
  );
  workers.push(
    new Worker(
      QUEUES.maintenance,
      async (job) => {
        if (job.name === "monitors") {
          const n = await scheduleDueMonitors(deps);
          if (n) log.debug({ scheduled: n }, "monitors scheduled");
          await alertOnBacklog();
        } else if (job.name === "balances") {
          await warnLowBalances();
        } else if (job.name === "retention") {
          const day = 86_400_000;
          await db.delete(crawls).where(lt(crawls.createdAt, new Date(Date.now() - 7 * day)));
          await db
            .delete(monitorChanges)
            .where(lt(monitorChanges.detectedAt, new Date(Date.now() - 90 * day)));
          await db
            .delete(usageEvents)
            .where(lt(usageEvents.createdAt, new Date(Date.now() - 400 * day)));
          await db.execute(sql`DELETE FROM brand WHERE updated_at < now() - interval '90 days'`);
          await db
            .delete(webhookDeliveries)
            .where(lt(webhookDeliveries.createdAt, new Date(Date.now() - 30 * day)));
          log.info("retention cleanup done");
        }
      },
      { connection, concurrency: 1 },
    ),
  );
}

for (const w of workers) {
  w.on("failed", (job, err) => {
    log.warn({ queue: w.name, jobId: job?.id, err: err.message }, "job failed");
    // Retries are normal; only a job that has given up is a real failure.
    const attempts = job?.opts.attempts ?? 1;
    if (!job || job.attemptsMade >= attempts)
      errors.capture(err, { queue: w.name, jobId: job?.id, attempts: job?.attemptsMade });
  });
  w.on("error", (err) => errors.capture(err, { queue: w.name, kind: "worker" }));
}
log.info(
  { roles: [...roles], browserConcurrency: config.BROWSER_CONCURRENCY },
  "pluck worker started",
);

installProcessHandlers(errors, async () => {
  await Promise.allSettled(workers.map((w) => w.close(true)));
});

let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    if (stopping) return;
    stopping = true;
    log.info({ signal }, "draining workers");
    setTimeout(() => process.exit(1), 60_000).unref();
    await Promise.allSettled(workers.map((w) => w.close()));
    await Promise.allSettled([
      usage.close(),
      errors.close(),
      browser.close(),
      http.close(),
      ...Object.values(queues).map((q) => q.close()),
    ]);
    redis.disconnect();
    await db.$client.end({ timeout: 5 });
    process.exit(0);
  });
}
