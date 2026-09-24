import { creditLedger } from "@pluck/db";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { invoiceUrl } from "@/lib/polar";
import { siteUrl } from "@/lib/site";
import { can, getWorkspace } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Redirects to the invoice for one order, after checking the workspace owns it. */
export async function GET(_request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const ctx = await getWorkspace();
  if (!ctx) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!can.manageBilling(ctx.workspace.role))
    return NextResponse.json(
      { error: "Only workspace owners and admins can manage billing." },
      { status: 403 },
    );

  const { orderId } = await params;
  // The ledger row is the proof of ownership: it is written from the webhook,
  // so an order id alone is never enough to read someone else's invoice.
  const [row] = await db
    .select({ id: creditLedger.id })
    .from(creditLedger)
    .where(
      and(eq(creditLedger.orgId, ctx.workspace.id), eq(creditLedger.reference, `polar:${orderId}`)),
    );
  if (!row) return NextResponse.json({ error: "Order not found." }, { status: 404 });

  const url = await invoiceUrl(orderId);
  if (url) return NextResponse.redirect(url);

  // Polar issues an invoice only once it holds a billing name and address, and
  // the portal is where those are entered, so say that rather than 503.
  return NextResponse.redirect(
    siteUrl("/dashboard/invoices", {
      error:
        "That invoice needs your billing name and address first. Add them under payment methods, then download again.",
    }),
  );
}
