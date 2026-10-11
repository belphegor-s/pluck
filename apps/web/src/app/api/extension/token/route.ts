import { extensionTokenRequest } from "@pluck/shared";
import {
  ExtensionAuthError,
  extensionCors,
  extensionFromOrigin,
  limiter,
  redeemExtensionCode,
} from "@/lib/extension";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowed = limiter(20, 10 * 60 * 1000);

const json = (request: Request, body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { ...extensionCors(request), "cache-control": "no-store" },
  });

export function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: extensionCors(request) });
}

/**
 * The last step of the extension's sign-in: a one-time code plus the PKCE
 * verifier, exchanged for an API key that belongs to that browser alone.
 */
export async function POST(request: Request) {
  const ext = extensionFromOrigin(request);
  if (!ext) return json(request, { error: "This extension is not allowed to sign in here." }, 403);
  if (!allowed(request)) return json(request, { error: "Too many attempts. Try again soon." }, 429);

  const parsed = extensionTokenRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json(request, { error: "Malformed request." }, 400);

  try {
    return json(request, await redeemExtensionCode(parsed.data.code, parsed.data.verifier, ext));
  } catch (err) {
    if (err instanceof ExtensionAuthError) return json(request, { error: err.message }, err.status);
    throw err;
  }
}
