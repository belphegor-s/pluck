import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { customerPortal } from "@/lib/polar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Sends the signed-in user to their Polar portal: payment methods and receipts. */
export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const result = await customerPortal(session.user.id);
  if (result.ok) return NextResponse.redirect(result.url);

  // Back to the page they came from, with something to read: a JSON error in
  // the address bar is no use to someone who clicked a link.
  const message = {
    disabled: "Billing is not enabled on this instance.",
    "no-purchases": "The payment portal opens once you have bought credits.",
    failed: "The payment portal is unavailable right now. Try again shortly.",
  }[result.reason];
  const back = new URL("/dashboard/invoices", request.url);
  back.searchParams.set("error", message);
  return NextResponse.redirect(back);
}
