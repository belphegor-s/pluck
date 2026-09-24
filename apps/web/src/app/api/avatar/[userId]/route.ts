import { userAvatars } from "@pluck/db";
import { eq } from "drizzle-orm";
import { avatarIdPattern, avatarResponse } from "@/lib/avatars";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A person's uploaded picture. */
export async function GET(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  if (!avatarIdPattern.test(userId)) return new Response(null, { status: 404 });
  const [row] = await db
    .select({
      data: userAvatars.data,
      contentType: userAvatars.contentType,
      hash: userAvatars.hash,
    })
    .from(userAvatars)
    .where(eq(userAvatars.userId, userId));
  return avatarResponse(request, row);
}
