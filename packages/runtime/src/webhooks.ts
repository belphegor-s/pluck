import { type Database, newId, users, webhookDeliveries } from "@pluck/db";
import { BRAND, PluckError } from "@pluck/shared";
import { and, eq, sql } from "drizzle-orm";
import { type Dispatcher, request } from "undici";
import { type Queues, signWebhook, WEBHOOK_SIGNATURE_HEADER } from "./queues.js";

/** Enough of a receiver's reply to diagnose it, not enough to store a page. */
const ERROR_SNIPPET = 300;

export interface WebhookEvent {
  userId: string;
  url: string;
  event: string;
  payload: unknown;
}

/**
 * Records a delivery, then queues it.
 *
 * The row is written first so a delivery exists to look at even if queueing
 * fails; every webhook in the product goes through here, so the log is whole.
 */
export async function enqueueWebhook(
  db: Database,
  queues: Pick<Queues, "webhook">,
  event: WebhookEvent,
): Promise<string> {
  const id = newId("whd");
  await db.insert(webhookDeliveries).values({
    id,
    userId: event.userId,
    event: event.event,
    url: event.url,
    payload: event.payload as object,
  });
  await queues.webhook.add(event.event, { deliveryId: id }, { jobId: id });
  return id;
}

/**
 * A fresh job id for one redelivery. BullMQ rejects ":" in custom ids, since
 * it separates its own Redis keys with it.
 */
export const redeliveryJobId = (deliveryId: string, now = Date.now()) => `${deliveryId}-r${now}`;

/**
 * Sends a delivery again, as a fresh run of attempts.
 *
 * The queue keeps finished jobs for a while, so reusing the delivery id as the
 * job id would be silently ignored; each redelivery gets its own job id and
 * the same delivery row.
 */
export async function redeliverWebhook(
  db: Database,
  queues: Pick<Queues, "webhook">,
  userId: string,
  id: string,
) {
  const owned = and(eq(webhookDeliveries.id, id), eq(webhookDeliveries.userId, userId));
  const [before] = await db.select().from(webhookDeliveries).where(owned).limit(1);
  if (!before) throw new PluckError("not_found", "Delivery not found.");

  // Pending is set before the job exists, so a fast worker cannot finish and
  // then be overwritten. If queueing fails the row goes back to what it was
  // rather than showing a send that will never happen.
  const [row] = await db
    .update(webhookDeliveries)
    .set({ status: "pending", lastError: null })
    .where(owned)
    .returning();
  if (!row) throw new PluckError("not_found", "Delivery not found.");
  try {
    await queues.webhook.add(row.event, { deliveryId: id }, { jobId: redeliveryJobId(id) });
  } catch (err) {
    await db
      .update(webhookDeliveries)
      .set({ status: before.status, lastError: before.lastError })
      .where(owned);
    throw err;
  }
  return row;
}

export interface AttemptResult {
  ok: boolean;
  status: number | null;
  error: string | null;
  durationMs: number;
}

/**
 * One attempt at a delivery: sign, send, and record what happened.
 *
 * Returns the outcome rather than throwing, so the caller decides whether the
 * queue retries; `final` marks the last attempt the queue will make, which is
 * when a failure becomes permanent.
 */
export async function attemptDelivery(
  db: Database,
  dispatcher: Dispatcher,
  deliveryId: string,
  opts: { final: boolean; assertTarget: (url: string) => void },
): Promise<AttemptResult> {
  const [row] = await db
    .select({ delivery: webhookDeliveries, secret: users.webhookSecret })
    .from(webhookDeliveries)
    .innerJoin(users, eq(users.id, webhookDeliveries.userId))
    .where(eq(webhookDeliveries.id, deliveryId));
  // Deleted with its account: nothing to send and nothing to retry.
  if (!row) return { ok: true, status: null, error: null, durationMs: 0 };

  const { delivery, secret } = row;
  const started = Date.now();
  let result: AttemptResult;
  try {
    opts.assertTarget(delivery.url);
    const body = JSON.stringify({
      id: delivery.id,
      event: delivery.event,
      deliveredAt: new Date().toISOString(),
      data: delivery.payload,
    });
    const res = await request(delivery.url, {
      method: "POST",
      dispatcher,
      headers: {
        "content-type": "application/json",
        "user-agent": `${BRAND.name}-Webhooks/1.0`,
        [BRAND.header("event")]: delivery.event,
        [BRAND.header("delivery")]: delivery.id,
        [WEBHOOK_SIGNATURE_HEADER]: signWebhook(secret, body),
      },
      body,
      headersTimeout: 15_000,
      bodyTimeout: 15_000,
    });
    const reply = (await res.body.text().catch(() => "")).slice(0, ERROR_SNIPPET);
    const ok = res.statusCode < 300;
    result = {
      ok,
      status: res.statusCode,
      error: ok ? null : `HTTP ${res.statusCode}${reply ? `: ${reply}` : ""}`,
      durationMs: Date.now() - started,
    };
  } catch (err) {
    result = {
      ok: false,
      status: null,
      error: (err instanceof Error ? err.message : String(err)).slice(0, ERROR_SNIPPET),
      durationMs: Date.now() - started,
    };
  }

  await db
    .update(webhookDeliveries)
    .set({
      attempts: sql`${webhookDeliveries.attempts} + 1`,
      lastStatus: result.status,
      lastError: result.error,
      lastDurationMs: result.durationMs,
      // A failure is only final once the queue has stopped retrying.
      status: result.ok ? "succeeded" : opts.final ? "failed" : "pending",
      ...(result.ok ? { deliveredAt: new Date() } : {}),
    })
    .where(eq(webhookDeliveries.id, deliveryId));

  return result;
}
