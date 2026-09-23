import { assertPublicUrl } from "@pluck/core";
import { webhookDeliveries } from "@pluck/db";
import { enqueueWebhook, redeliverWebhook } from "@pluck/runtime";
import { BRAND, PluckError, type WebhookDelivery } from "@pluck/shared";
import { and, desc, eq, lt } from "drizzle-orm";
import { handler } from "../handler.js";

const toDelivery = (row: typeof webhookDeliveries.$inferSelect): WebhookDelivery => ({
  id: row.id,
  event: row.event,
  url: row.url,
  status: row.status,
  attempts: row.attempts,
  lastStatus: row.lastStatus,
  lastError: row.lastError,
  lastDurationMs: row.lastDurationMs,
  createdAt: row.createdAt.toISOString(),
  deliveredAt: row.deliveredAt?.toISOString() ?? null,
});

export const webhookDeliveriesList = handler("webhookDeliveries", {
  estimate: () => 0,
  async run({ s, caller }, { cursor, limit }) {
    const rows = await s.db
      .select()
      .from(webhookDeliveries)
      .where(
        and(
          eq(webhookDeliveries.orgId, caller.orgId),
          cursor ? lt(webhookDeliveries.id, cursor) : undefined,
        ),
      )
      .orderBy(desc(webhookDeliveries.id))
      .limit(limit + 1);
    const slice = rows.slice(0, limit);
    return {
      data: {
        deliveries: slice.map(toDelivery),
        nextCursor: rows.length > limit ? slice.at(-1)!.id : null,
      },
      credits: 0,
    };
  },
});

export const webhookRedeliver = handler("webhookRedeliver", {
  estimate: () => 0,
  async run({ s, caller }, { id }) {
    const row = await redeliverWebhook(s.db, s.queues, caller.orgId, id);
    return { data: toDelivery(row), credits: 0, status: 202 };
  },
});

export const webhookTest = handler("webhookTest", {
  estimate: () => 0,
  target: (i) => i.url,
  async run({ s, caller }, { url }) {
    // Refused here rather than on the first attempt, so a typo'd private
    // address is an immediate 403 and not a failed delivery minutes later.
    assertPublicUrl(url, s.config.ALLOW_PRIVATE_NETWORK);
    const id = await enqueueWebhook(s.db, s.queues, {
      orgId: caller.orgId,
      url,
      event: "webhook.test",
      payload: {
        message: `A test event from ${BRAND.name}. Verify its signature the same way as any other.`,
      },
    });
    const [row] = await s.db.select().from(webhookDeliveries).where(eq(webhookDeliveries.id, id));
    if (!row) throw new PluckError("internal", "The test delivery was not recorded.");
    return { data: toDelivery(row), credits: 0, status: 202 };
  },
});
