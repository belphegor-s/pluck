import { createHmac } from "node:crypto";
import type { Renderer, RenderRequest, RenderResult } from "@pluck/core";
import { BRAND, isPluckError, PluckError } from "@pluck/shared";
import { type ConnectionOptions, type Job, Queue, QueueEvents } from "bullmq";
import type { Redis } from "ioredis";

export const QUEUES = {
  render: "render",
  crawl: "crawl",
  monitor: "monitor",
  webhook: "webhook",
  maintenance: "maintenance",
} as const;

export interface CrawlJobData {
  crawlId: string;
}
export interface MonitorJobData {
  monitorId: string;
}
/**
 * A webhook job names a delivery row and nothing else. The payload, target and
 * signing secret are read from the database when it is sent, so secrets never
 * sit in Redis and sending one again is just queueing the id again.
 */
export interface WebhookJobData {
  deliveryId: string;
}

/** Serialised error carried across the queue boundary. */
interface RenderFailure {
  __pluckError: true;
  code: string;
  message: string;
}

export const encodeRenderError = (err: unknown): RenderFailure => ({
  __pluckError: true,
  code: isPluckError(err) ? err.code : "target_unreachable",
  message: err instanceof Error ? err.message : "Rendering failed.",
});

export function createQueues(connection: Redis) {
  const opts = { connection: connection as unknown as ConnectionOptions };
  return {
    render: new Queue<RenderRequest, RenderResult | RenderFailure>(QUEUES.render, {
      ...opts,
      defaultJobOptions: { removeOnComplete: { age: 30 }, removeOnFail: { age: 300 }, attempts: 1 },
    }),
    crawl: new Queue<CrawlJobData>(QUEUES.crawl, {
      ...opts,
      defaultJobOptions: {
        removeOnComplete: { age: 3600 },
        removeOnFail: { age: 86_400 },
        attempts: 3,
        backoff: { type: "exponential", delay: 5_000 },
      },
    }),
    monitor: new Queue<MonitorJobData>(QUEUES.monitor, {
      ...opts,
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: { age: 86_400 },
        attempts: 2,
        backoff: { type: "fixed", delay: 30_000 },
      },
    }),
    webhook: new Queue<WebhookJobData>(QUEUES.webhook, {
      ...opts,
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: { age: 7 * 86_400 },
        attempts: 8,
        backoff: { type: "exponential", delay: 10_000 },
      },
    }),
    maintenance: new Queue(QUEUES.maintenance, {
      ...opts,
      defaultJobOptions: { removeOnComplete: true, removeOnFail: 100 },
    }),
  };
}

export type Queues = ReturnType<typeof createQueues>;

/**
 * Renderer that dispatches to the browser worker fleet through Redis and
 * awaits the result. Adds ~2-5 ms over an in-process call, in exchange for
 * global backpressure and independent scaling of browsers.
 */
export class QueueRenderer implements Renderer {
  private readonly events: QueueEvents;

  constructor(
    private readonly queue: Queues["render"],
    connection: Redis,
  ) {
    this.events = new QueueEvents(QUEUES.render, {
      connection: connection.duplicate() as unknown as ConnectionOptions,
    });
  }

  async render(req: RenderRequest): Promise<RenderResult> {
    const job: Job = await this.queue.add("render", req, { priority: req.screenshot ? 2 : 1 });
    let result: RenderResult | RenderFailure;
    try {
      // Budget for queue wait on top of the page timeout.
      result = await job.waitUntilFinished(this.events, req.timeout + 30_000);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/timed out/i.test(message))
        throw new PluckError(
          "target_timeout",
          "The browser fleet is busy or the page took too long.",
        );
      throw new PluckError("target_unreachable", message);
    }
    if ((result as RenderFailure).__pluckError) {
      const f = result as RenderFailure;
      throw new PluckError(f.code as never, f.message);
    }
    return result as RenderResult;
  }

  async close() {
    await this.events.close();
  }
}

/** Header name carrying the signature, e.g. `pluck-signature`. */
export const WEBHOOK_SIGNATURE_HEADER = BRAND.header("signature");

export function signWebhook(
  secret: string,
  body: string,
  timestamp = Math.floor(Date.now() / 1000),
) {
  const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return `t=${timestamp},v1=${signature}`;
}
