import { credentialFromEnv } from "@pluck/ai";
import { HttpClient, ProxyPool, RobotsCache, Scraper, searchFromEnv } from "@pluck/core";
import { createDb } from "@pluck/db";
import {
  type Config,
  Credits,
  createLogger,
  createQueues,
  createRedis,
  JsonCache,
  LlmResolver,
  QueueRenderer,
  S3Store,
  UsageRecorder,
} from "@pluck/runtime";

export type Services = Awaited<ReturnType<typeof createServices>>;

export async function createServices(config: Config) {
  const log = createLogger(config, "api");
  const db = createDb(config.DATABASE_URL, { max: config.DATABASE_POOL_SIZE });
  const queueRedis = createRedis(config.REDIS_URL, { forQueue: true });
  const cacheRedis = config.CACHE_REDIS_URL
    ? createRedis(config.CACHE_REDIS_URL, { forQueue: false })
    : queueRedis;

  const proxies = ProxyPool.fromEnv(config);
  const http = new HttpClient({ proxies, allowPrivateNetwork: config.ALLOW_PRIVATE_NETWORK });
  const robots = new RobotsCache(http);
  const queues = createQueues(queueRedis);
  const renderer = new QueueRenderer(queues.render, queueRedis);
  const store = S3Store.fromConfig(config);
  const llm = new LlmResolver(db, config, credentialFromEnv(config));

  return {
    config,
    log,
    db,
    queueRedis,
    cacheRedis,
    cache: new JsonCache(cacheRedis),
    http,
    robots,
    queues,
    renderer,
    store,
    // Keyless search falls back to a browser render when the engine blocks plain HTTP.
    search: searchFromEnv(config, http, async (url) => {
      const rendered = await renderer.render({
        url,
        timeout: 30_000,
        proxy: "none",
        blockAds: true,
      });
      return rendered.html;
    }),
    llm,
    credits: new Credits(db, config.BILLING_ENABLED),
    usage: new UsageRecorder(db, log),
    /** Scraper bound to a specific caller's LLM credentials. */
    scraper(extractor: ConstructorParameters<typeof Scraper>[0]["extractor"] = null) {
      return new Scraper({
        http,
        robots,
        renderer,
        store,
        extractor,
        allowPrivateNetwork: config.ALLOW_PRIVATE_NETWORK,
      });
    },
    async close() {
      await this.usage.close();
      await renderer.close();
      await Promise.all(Object.values(queues).map((q) => q.close()));
      await http.close();
      queueRedis.disconnect();
      if (cacheRedis !== queueRedis) cacheRedis.disconnect();
      await db.$client.end({ timeout: 5 });
    },
  };
}
