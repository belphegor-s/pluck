import "server-only";
import { creditLedger } from "@pluck/db";
import { Polar } from "@polar-sh/sdk";
import { and, desc, eq, like } from "drizzle-orm";
import { db } from "@/lib/db";

/**
 * Polar is optional: a self-hosted instance has no billing at all, so every
 * helper here returns null rather than throwing when it is not configured.
 */
export function polarClient(): Polar | null {
  const accessToken = process.env.POLAR_ACCESS_TOKEN;
  if (!accessToken) return null;
  return new Polar({
    accessToken,
    server: process.env.POLAR_SERVER === "sandbox" ? "sandbox" : "production",
  });
}

/** Ledger references for purchases look like `polar:<order id>`. */
export const orderIdFromReference = (reference: string | null): string | null =>
  reference?.startsWith("polar:") ? reference.slice("polar:".length) : null;

export interface Purchase {
  orderId: string;
  createdAt: Date;
  credits: number;
  /** Cents, as charged, including tax. */
  amount: number;
  currency: string;
  status: string;
  productName: string | null;
  invoiceNumber: string | null;
  invoiceReady: boolean;
}

/**
 * The account's purchases, joined from our ledger to Polar.
 *
 * The ledger is the list of what we actually granted credits for, so it — not
 * Polar's customer record — decides what belongs to this user. Polar then fills
 * in what only it knows: tax, invoice number, refunds.
 */
export async function purchasesForUser(userId: string): Promise<Purchase[]> {
  const rows = await db
    .select()
    .from(creditLedger)
    .where(and(eq(creditLedger.userId, userId), like(creditLedger.reference, "polar:%")))
    .orderBy(desc(creditLedger.id))
    .limit(50);

  const polar = polarClient();
  return Promise.all(
    rows.map(async (row) => {
      const orderId = orderIdFromReference(row.reference)!;
      const base: Purchase = {
        orderId,
        createdAt: row.createdAt,
        credits: row.delta,
        amount: row.amountUsdCents ?? 0,
        currency: "usd",
        status: "paid",
        productName: null,
        invoiceNumber: null,
        invoiceReady: false,
      };
      if (!polar) return base;
      try {
        const order = await polar.orders.get({ id: orderId });
        return {
          ...base,
          amount: order.totalAmount ?? base.amount,
          currency: order.currency ?? base.currency,
          status: order.status ?? base.status,
          productName: order.product?.name ?? null,
          invoiceNumber: order.invoiceNumber ?? null,
          invoiceReady: Boolean(order.isInvoiceGenerated),
        };
      } catch {
        // An order from the other Polar environment, or one since deleted: the
        // ledger row is still the truth about credits, so show what we have.
        return base;
      }
    }),
  );
}

/**
 * Finds the Polar customer behind an account.
 *
 * Not by `externalCustomerId`: Polar matches an existing customer by email at
 * checkout, and that customer may already carry someone else's external id —
 * which is exactly why looking it up that way always failed. The customer on an
 * order we granted credits for is the one that belongs to this user.
 */
async function customerIdForUser(userId: string): Promise<string | null> {
  const polar = polarClient();
  if (!polar) return null;
  const [row] = await db
    .select()
    .from(creditLedger)
    .where(and(eq(creditLedger.userId, userId), like(creditLedger.reference, "polar:%")))
    .orderBy(desc(creditLedger.id))
    .limit(1);
  const orderId = orderIdFromReference(row?.reference ?? null);
  if (!orderId) return null;
  try {
    const order = await polar.orders.get({ id: orderId });
    return order.customerId ?? null;
  } catch {
    return null;
  }
}

export type PortalResult =
  | { ok: true; url: string }
  | { ok: false; reason: "disabled" | "no-purchases" | "failed" };

/** A session on Polar's hosted portal: payment methods and past receipts. */
export async function customerPortal(userId: string): Promise<PortalResult> {
  const polar = polarClient();
  if (!polar) return { ok: false, reason: "disabled" };
  const customerId = await customerIdForUser(userId);
  if (!customerId) return { ok: false, reason: "no-purchases" };
  try {
    const session = await polar.customerSessions.create({ customerId });
    return { ok: true, url: session.customerPortalUrl };
  } catch (err) {
    console.error("polar portal session failed:", err);
    return { ok: false, reason: "failed" };
  }
}

/**
 * Returns a download URL for an order's invoice, generating it on first ask.
 * Generation is asynchronous, so we poll briefly rather than make the caller
 * come back later.
 */
export async function invoiceUrl(orderId: string): Promise<string | null> {
  const polar = polarClient();
  if (!polar) return null;

  const fetchUrl = async () => {
    try {
      const invoice = await polar.orders.invoice({ id: orderId });
      return invoice.url;
    } catch {
      return null;
    }
  };

  const existing = await fetchUrl();
  if (existing) return existing;

  try {
    await polar.orders.generateInvoice({ id: orderId });
  } catch (err) {
    // Polar refuses until it has a billing name and address for the customer;
    // the portal is where they add it.
    console.error("polar invoice generation failed:", err);
    return null;
  }
  for (let attempt = 0; attempt < 8; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const url = await fetchUrl();
    if (url) return url;
  }
  return null;
}
