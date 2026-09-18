import { creditLedger } from "@pluck/db";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { customerPortalUrl, invoiceUrl } from "@/lib/polar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Redirects to the invoice for one order, after checking the caller owns it. */
export async function GET(_request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { orderId } = await params;
  // The ledger row is the proof of ownership: it is written from the webhook,
  // so an order id alone is never enough to read someone else's invoice.
  const [row] = await db
    .select({ id: creditLedger.id })
    .from(creditLedger)
    .where(
      and(eq(creditLedger.userId, session.user.id), eq(creditLedger.reference, `polar:${orderId}`)),
    );
  if (!row) return NextResponse.json({ error: "Order not found." }, { status: 404 });

  const url = await invoiceUrl(orderId);
  if (url) return NextResponse.redirect(url);

  // Polar issues an invoice only once it has billing details for the customer.
  const portal = await customerPortalUrl(session.user.id);
  if (portal) return NextResponse.redirect(portal);
  return NextResponse.json({ error: "Invoice is not available yet." }, { status: 503 });
}
