import { type Database, creditLedger, usageEvents, users } from "@pluck/db";
import { PluckError } from "@pluck/shared";
import { and, eq, gte, sql } from "drizzle-orm";
import type { Logger } from "./infra.js";

/**
 * Prepaid credit accounting on a single row per user.
 *
 * `reserve` atomically debits an estimate (fails with 402 when the balance is
 * too low), `settle` applies the difference to the real cost. The balance can
 * dip slightly below zero only when actual cost exceeds the estimate, which
 * is bounded by the per-request maximum.
 */
export class Credits {
  constructor(
    private readonly db: Database,
    readonly enabled: boolean,
  ) {}

  async reserve(userId: string, amount: number): Promise<void> {
    if (!this.enabled || amount <= 0) return;
    const rows = await this.db
      .update(users)
      .set({ credits: sql`${users.credits} - ${amount}` })
      .where(and(eq(users.id, userId), gte(users.credits, amount)))
      .returning({ credits: users.credits });
    if (rows.length === 0) {
      throw new PluckError("insufficient_credits", `This request needs ${amount} credit(s). Top up in the dashboard under Billing.`, {
        required: amount,
      });
    }
  }

  async settle(userId: string, reserved: number, actual: number): Promise<void> {
    if (!this.enabled || reserved === actual) return;
    await this.db
      .update(users)
      .set({ credits: sql`${users.credits} + ${reserved - actual}` })
      .where(eq(users.id, userId));
  }

  async balance(userId: string): Promise<number | null> {
    if (!this.enabled) return null;
    const [row] = await this.db.select({ credits: users.credits }).from(users).where(eq(users.id, userId));
    return row?.credits ?? 0;
  }

  /** Idempotent grant keyed by `reference` (e.g. Polar order id). Returns false if already applied. */
  async grant(userId: string, amount: number, reason: "signup" | "purchase" | "refund" | "adjustment", reference?: string, amountUsdCents?: number) {
    return this.db.transaction(async (tx) => {
      const inserted = await tx
        .insert(creditLedger)
        .values({ userId, delta: amount, reason, reference, amountUsdCents })
        .onConflictDoNothing({ target: creditLedger.reference })
        .returning({ id: creditLedger.id });
      if (inserted.length === 0) return false;
      await tx
        .update(users)
        .set({ credits: sql`${users.credits} + ${amount}`, lowBalanceNotifiedAt: null })
        .where(eq(users.id, userId));
      return true;
    });
  }
}

export interface UsageRecord {
  userId: string;
  apiKeyId: string | null;
  requestId: string;
  endpoint: string;
  status: number;
  credits: number;
  durationMs: number;
  cached: boolean;
  target: string | null;
}

/** Buffers usage rows and writes them in batches off the request path. */
export class UsageRecorder {
  private buffer: UsageRecord[] = [];
  private readonly timer: NodeJS.Timeout;

  constructor(
    private readonly db: Database,
    private readonly log: Logger,
    private readonly maxBatch = 500,
  ) {
    this.timer = setInterval(() => void this.flush(), 1_000);
    this.timer.unref();
  }

  record(row: UsageRecord) {
    this.buffer.push(row);
    if (this.buffer.length >= this.maxBatch) void this.flush();
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const rows = this.buffer;
    this.buffer = [];
    try {
      await this.db.insert(usageEvents).values(rows.map((r) => ({ ...r, target: r.target?.slice(0, 2048) ?? null })));
    } catch (err) {
      this.log.error({ err, count: rows.length }, "failed to write usage events");
    }
  }

  async close() {
    clearInterval(this.timer);
    await this.flush();
  }
}
