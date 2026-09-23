import { NextResponse } from "next/server";
import { customerPortal } from "@/lib/polar";
import { siteUrl } from "@/lib/site";
import { can, getWorkspace } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Sends the workspace's billing admin to its Polar portal: payment methods and receipts. */
export async function GET() {
  const ctx = await getWorkspace();
  if (!ctx) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!can.manageBilling(ctx.workspace.role))
    return NextResponse.json(
      { error: "Only workspace owners and admins can manage billing." },
      { status: 403 },
    );

  const result = await customerPortal(ctx.workspace.id);
  if (result.ok) return NextResponse.redirect(result.url);

  // Back to the page they came from, with something to read: a JSON error in
  // the address bar is no use to someone who clicked a link.
  const message = {
    disabled: "Billing is not enabled on this instance.",
    "no-purchases": "The payment portal opens once you have bought credits.",
    failed: "The payment portal is unavailable right now. Try again shortly.",
  }[result.reason];
  return NextResponse.redirect(siteUrl("/dashboard/invoices", { error: message }));
}
