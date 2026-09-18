import { creditLedger, users } from "@pluck/db";
import { CREDIT_USD } from "@pluck/shared";
import { desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import Link from "next/link";
import { BuyCredits } from "@/components/dashboard/buy-credits";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatNumber } from "@/lib/format";
import { orderIdFromReference } from "@/lib/polar";

export const metadata = { title: "Credits" };
export const dynamic = "force-dynamic";

const REASONS: Record<string, string> = {
  signup: "Welcome credits",
  purchase: "Purchase",
  refund: "Refund",
  adjustment: "Adjustment",
};

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ purchase?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  const { purchase } = await searchParams;
  const userId = session!.user.id;

  const [[account], ledger] = await Promise.all([
    db.select({ credits: users.credits }).from(users).where(eq(users.id, userId)),
    db
      .select()
      .from(creditLedger)
      .where(eq(creditLedger.userId, userId))
      .orderBy(desc(creditLedger.id))
      .limit(20),
  ]);

  const purchases = ledger.filter((row) => orderIdFromReference(row.reference));

  return (
    <div className="space-y-8">
      {purchase === "success" && (
        <p className="sheet border-[var(--leaf)] p-3 text-sm text-[var(--leaf)]">
          Payment received. Credits appear here within a few seconds of Polar confirming the order.
        </p>
      )}

      <section>
        <h2 className="text-lg">Balance</h2>
        <p className="mono mt-2 text-3xl">{formatNumber(account?.credits ?? 0)}</p>
        <p className="mt-1 text-sm text-[var(--ink-soft)]">
          ≈ ${((account?.credits ?? 0) * CREDIT_USD).toFixed(2)} of usage. Credits never expire, and
          there is no subscription.
        </p>
      </section>

      <section>
        <h2 className="text-lg">Top up</h2>
        <p className="mt-1 text-sm text-[var(--ink-soft)]">
          Bigger packs carry a bonus. Payments are handled by Polar.
        </p>
        <div className="mt-4">
          <BuyCredits />
        </div>
        <p className="mt-3 text-sm text-[var(--ink-soft)]">
          Need millions of credits, an invoice or a dedicated region?{" "}
          <Link href="/enterprise" className="text-[var(--accent)] underline underline-offset-4">
            Talk to us
          </Link>
          .
        </p>
      </section>

      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-lg">History</h2>
          {purchases.length > 0 && (
            <Link
              href="/dashboard/invoices"
              className="text-sm text-[var(--accent)] underline underline-offset-4"
            >
              Invoices and payment methods
            </Link>
          )}
        </div>
        {ledger.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--ink-soft)]">No credit events yet.</p>
        ) : (
          <div className="sheet mt-3 overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <thead className="text-left text-xs text-[var(--ink-faint)]">
                <tr>
                  {["Date", "Reason", "Credits", "Paid", "Invoice"].map((h) => (
                    <th key={h} className="border-b border-[var(--line)] px-3 py-2 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ledger.map((row) => {
                  const orderId = orderIdFromReference(row.reference);
                  return (
                    <tr key={row.id} className="border-b border-[var(--line)] last:border-0">
                      <td className="mono px-3 py-2 text-xs text-[var(--ink-faint)]">
                        {row.createdAt.toISOString().slice(0, 10)}
                      </td>
                      <td className="px-3 py-2">{REASONS[row.reason] ?? row.reason}</td>
                      <td className="mono px-3 py-2 text-xs">
                        {row.delta < 0 ? "" : "+"}
                        {formatNumber(row.delta)}
                      </td>
                      <td className="mono px-3 py-2 text-xs text-[var(--ink-faint)]">
                        {row.amountUsdCents ? `$${(row.amountUsdCents / 100).toFixed(2)}` : "—"}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {orderId ? (
                          <a
                            href={`/api/invoice/${orderId}`}
                            className="text-[var(--accent)] underline underline-offset-4"
                          >
                            Download
                          </a>
                        ) : (
                          <span className="text-[var(--ink-faint)]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
