import { organizationAvatars } from "@pluck/db";
import { eq } from "drizzle-orm";
import { avatarIdPattern, avatarResponse } from "@/lib/avatars";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A workspace's uploaded picture. */
export async function GET(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  if (!avatarIdPattern.test(orgId)) return new Response(null, { status: 404 });
  const [row] = await db
    .select({
      data: organizationAvatars.data,
      contentType: organizationAvatars.contentType,
      hash: organizationAvatars.hash,
    })
    .from(organizationAvatars)
    .where(eq(organizationAvatars.orgId, orgId));
  return avatarResponse(request, row);
}
