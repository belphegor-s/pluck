import { creditPacks } from "@pluck/shared";
import { Polar } from "@polar-sh/sdk";
import { NextResponse } from "next/server";
import { SITE } from "@/lib/site";
import { can, getWorkspace } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Product ids are configured per pack: POLAR_PRODUCT_STARTER, POLAR_PRODUCT_BUILDER, … */
const productFor = (packId: string) => process.env[`POLAR_PRODUCT_${packId.toUpperCase()}`];

export async function POST(request: Request) {
  const ctx = await getWorkspace();
  if (!ctx) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!can.manageBilling(ctx.workspace.role))
    return NextResponse.json(
      { error: "Only workspace owners and admins can manage billing." },
      { status: 403 },
    );

  const token = process.env.POLAR_ACCESS_TOKEN;
  const { packId } = (await request.json().catch(() => ({}))) as { packId?: string };
  const pack = creditPacks.find((p) => p.id === packId);
  const productId = pack ? productFor(pack.id) : undefined;
  if (!token || !pack || !productId) {
    return NextResponse.json(
      { error: "Credit purchases are not enabled on this instance yet." },
      { status: 503 },
    );
  }

  const polar = new Polar({
    accessToken: token,
    server: process.env.POLAR_SERVER === "sandbox" ? "sandbox" : "production",
  });
  const checkout = await polar.checkouts.create({
    products: [productId],
    // The workspace is the customer. A personal workspace's id is its user's
    // id, so accounts that bought before workspaces existed stay one customer.
    externalCustomerId: ctx.workspace.id,
    customerEmail: ctx.user.email,
    successUrl: `${SITE.url}/dashboard/billing?purchase=success`,
    // orgId decides whose credits these are; userId records who paid.
    metadata: { orgId: ctx.workspace.id, userId: ctx.user.id, pack: pack.id },
  });
  return NextResponse.json({ url: checkout.url });
}
