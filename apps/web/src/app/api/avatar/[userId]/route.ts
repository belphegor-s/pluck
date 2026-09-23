import { userAvatars } from "@pluck/db";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Serves an uploaded profile picture. The URL carries the content hash
 * (`?v=`), so a response never changes and can be cached for good; a new
 * upload gets a new URL.
 */
export async function GET(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(userId)) return new Response(null, { status: 404 });

  const [row] = await db
    .select({ data: userAvatars.data, type: userAvatars.contentType, hash: userAvatars.hash })
    .from(userAvatars)
    .where(eq(userAvatars.userId, userId));
  if (!row) return new Response(null, { status: 404 });

  const etag = `"${row.hash}"`;
  const versioned = new URL(request.url).searchParams.get("v") === row.hash;
  const cache = versioned
    ? "public, max-age=31536000, immutable"
    : "public, max-age=300, stale-while-revalidate=86400";
  if (request.headers.get("if-none-match") === etag)
    return new Response(null, { status: 304, headers: { etag, "cache-control": cache } });

  return new Response(new Uint8Array(row.data), {
    headers: {
      "content-type": row.type,
      "content-length": String(row.data.length),
      "cache-control": cache,
      etag,
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'",
    },
  });
}
