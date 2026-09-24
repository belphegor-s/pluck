import { organizations } from "@pluck/db";
import { CREDIT_USD } from "@pluck/shared";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { AdminsOnly } from "@/components/dashboard/admins-only";
import { db } from "@/lib/db";
import { formatNumber, formatUsd } from "@/lib/format";
import { purchasesForWorkspace } from "@/lib/polar";
import { can, requireWorkspace } from "@/lib/workspace";

export const metadata = { title: "Invoices" };
export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, string> = {
  paid: "text-[var(--leaf)]",
  refunded: "text-[var(--ink-faint)]",
  partially_refunded: "text-[var(--ink-faint)]",
  pending: "text-[var(--ink-soft)]",
};

const date = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { workspace } = await requireWorkspace();
  // Receipts carry billing names and addresses, so they stay with the people
  // who pay; nothing is fetched from the payment provider for anyone else.
  if (!can.manageBilling(workspace.role))
    return (
      <div className="space-y-4">
        <h2 className="text-lg">Invoices</h2>
        <AdminsOnly what="see invoices and payment details" />
      </div>
    );
  const { error } = await searchParams;
  const orgId = workspace.id;

  const [[account], purchases] = await Promise.all([
    db
      .select({ credits: organizations.credits })
      .from(organizations)
      .where(eq(organizations.id, orgId)),
    purchasesForWorkspace(orgId),
  ]);

  const spent = purchases.reduce((total, p) => total + (p.status === "paid" ? p.amount : 0), 0);
  const bought = purchases.reduce((total, p) => total + p.credits, 0);

  return (
    <div className="space-y-8">
      {error && (
        <p className="sheet border-[var(--accent)] p-3 text-sm text-[var(--accent)]" role="status">
          {error}
        </p>
      )}

      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-lg">Invoices</h2>
          <a
            href="/api/portal"
            className="text-sm text-[var(--accent)] underline underline-offset-4"
          >
            Payment methods and billing details
          </a>
        </div>
        <p className="mt-1 text-sm text-[var(--ink-soft)]">
          Every credit purchase, with its invoice. Polar issues invoices once it has your billing
          name and address — add them in the portal if a download is missing.
        </p>
      </section>

      {purchases.length > 0 && (
        <section className="grid gap-4 sm:grid-cols-3">
          {[
            { label: "Paid to date", value: formatUsd(spent / 100) },
            { label: "Credits bought", value: formatNumber(bought) },
            {
              label: "Balance",
              value: `${formatNumber(account?.credits ?? 0)} · ${formatUsd((account?.credits ?? 0) * CREDIT_USD)}`,
            },
          ].map((stat) => (
            <div key={stat.label} className="sheet p-4">
              <p className="text-xs text-[var(--ink-faint)]">{stat.label}</p>
              <p className="mono mt-1 text-xl">{stat.value}</p>
            </div>
          ))}
        </section>
      )}

      <section>
        {purchases.length === 0 ? (
          <div className="sheet p-6">
            <p className="text-sm text-[var(--ink-soft)]">
              No purchases yet. Credits bought on this account appear here with a downloadable
              invoice.
            </p>
            <Link
              href="/dashboard/billing"
              className="mt-4 inline-block bg-[var(--ink)] px-4 py-2.5 text-sm text-[var(--paper)] sm:py-2"
            >
              Buy credits
            </Link>
          </div>
        ) : (
          <div className="sheet overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="text-left text-xs text-[var(--ink-faint)]">
                <tr>
                  {["Date", "Invoice", "What", "Credits", "Amount", "Status", ""].map((h) => (
                    <th key={h} className="border-b border-[var(--line)] px-3 py-2 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {purchases.map((purchase) => (
                  <tr
                    key={purchase.orderId}
                    className="border-b border-[var(--line)] last:border-0"
                  >
                    <td className="mono px-3 py-2.5 text-xs text-[var(--ink-faint)]">
                      {date.format(purchase.createdAt)}
                    </td>
                    <td className="mono px-3 py-2.5 text-xs">
                      {purchase.invoiceNumber ?? <span className="text-[var(--ink-faint)]">—</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      {purchase.productName ?? `${formatNumber(purchase.credits)} credits`}
                    </td>
                    <td className="mono px-3 py-2.5 text-xs">+{formatNumber(purchase.credits)}</td>
                    <td className="mono px-3 py-2.5 text-xs">{formatUsd(purchase.amount / 100)}</td>
                    <td
                      className={`px-3 py-2.5 text-xs ${STATUS_STYLE[purchase.status] ?? "text-[var(--ink-soft)]"}`}
                    >
                      {purchase.status.replace(/_/g, " ")}
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      <a
                        href={`/api/invoice/${purchase.orderId}`}
                        className="text-[var(--accent)] underline underline-offset-4"
                      >
                        {purchase.invoiceReady ? "Download" : "Generate"}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="border-t border-[var(--line)] pt-6">
        <h3 className="text-sm font-semibold">Need something else?</h3>
        <ul className="mt-2 space-y-1.5 text-sm text-[var(--ink-soft)]">
          <li>
            A VAT or company name on the invoice: add it in the{" "}
            <a href="/api/portal" className="text-[var(--accent)] underline underline-offset-4">
              billing portal
            </a>{" "}
            before downloading.
          </li>
          <li>
            Paying by invoice instead of card, or a purchase order:{" "}
            <Link href="/enterprise" className="text-[var(--accent)] underline underline-offset-4">
              talk to us
            </Link>
            .
          </li>
          <li>Credits never expire, and unused credits are refundable on request.</li>
        </ul>
      </section>
    </div>
  );
}
