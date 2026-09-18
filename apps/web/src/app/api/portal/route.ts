import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { customerPortalUrl } from "@/lib/polar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Sends the signed-in user to their Polar portal: receipts, invoices, cards. */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const url = await customerPortalUrl(session.user.id);
  if (!url) {
    return NextResponse.json(
      { error: "Billing is not enabled on this instance." },
      { status: 503 },
    );
  }
  return NextResponse.redirect(url);
}
