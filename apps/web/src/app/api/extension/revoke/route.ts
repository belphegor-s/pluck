import { extensionCors, limiter, revokeExtensionKey } from "@/lib/extension";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowed = limiter(30, 10 * 60 * 1000);

export function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: extensionCors(request) });
}

/**
 * Signing out of the extension revokes the key it was given, so a key nobody
 * holds any more does not keep working. The key itself is the credential.
 */
export async function POST(request: Request) {
  const headers = { ...extensionCors(request), "cache-control": "no-store" };
  if (!allowed(request))
    return Response.json({ error: "Too many attempts." }, { status: 429, headers });
  const key = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!key) return Response.json({ error: "Missing key." }, { status: 401, headers });
  return Response.json({ revoked: await revokeExtensionKey(key) }, { headers });
}
