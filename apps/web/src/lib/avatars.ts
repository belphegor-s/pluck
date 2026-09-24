import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";

/** The editor sends a 512px crop of a few dozen kilobytes; anything bigger is not from it. */
const MAX_UPLOAD_BYTES = 1_000_000;
const SIZE = 256;

export type Encoded = { ok: true; data: Buffer; hash: string } | { ok: false; error: string };

/**
 * Turns an uploaded picture into the stored form: decoded and re-encoded,
 * never kept as given. That drops EXIF (including location), rejects anything
 * that is not really an image, bounds decoding at 16 megapixels, and fixes
 * the size and format whatever the client did.
 */
export async function encodeAvatar(file: FormDataEntryValue | null): Promise<Encoded> {
  if (!(file instanceof File) || file.size === 0)
    return { ok: false, error: "Choose an image first." };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: "That image is too large." };
  try {
    const data = await sharp(Buffer.from(await file.arrayBuffer()), {
      limitInputPixels: 4096 * 4096,
      failOn: "error",
    })
      .rotate()
      .resize(SIZE, SIZE, { fit: "cover" })
      .webp({ quality: 82, effort: 4 })
      .toBuffer();
    return { ok: true, data, hash: createHash("sha256").update(data).digest("hex").slice(0, 16) };
  } catch {
    return { ok: false, error: "That file is not an image we can read. Try a PNG, JPEG or WebP." };
  }
}

/**
 * Serves a stored picture. The URL carries the content hash (`?v=`), so a
 * versioned response never changes and is cached for good; a new upload gets
 * a new URL.
 */
export function avatarResponse(
  request: Request,
  row: { data: Buffer; contentType: string; hash: string } | undefined,
): Response {
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
      "content-type": row.contentType,
      "content-length": String(row.data.length),
      "cache-control": cache,
      etag,
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'",
    },
  });
}

/** Ids in avatar URLs: anything else is not worth a lookup. */
export const avatarIdPattern = /^[A-Za-z0-9_-]{1,64}$/;
