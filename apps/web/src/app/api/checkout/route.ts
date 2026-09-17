import { creditPacks } from "@pluck/shared";
import { Polar } from "@polar-sh/sdk";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { SITE } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Product ids are configured per pack: POLAR_PRODUCT_STARTER, POLAR_PRODUCT_BUILDER, … */
const productFor = (packId: string) => process.env[`POLAR_PRODUCT_${packId.toUpperCase()}`];

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

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
    externalCustomerId: session.user.id,
    customerEmail: session.user.email,
    successUrl: `${SITE.url}/dashboard/billing?purchase=success`,
    metadata: { userId: session.user.id, pack: pack.id },
  });
  return NextResponse.json({ url: checkout.url });
}
