import "server-only";
import { BRAND, type EndpointId, type EndpointOutput, endpoints } from "@pluck/shared";
import { SITE } from "@/lib/site";

/** Same names the API derives, so renaming the product renames these too. */
const INTERNAL_SECRET_HEADER = `x-${BRAND.header("internal")}`;
const INTERNAL_USER_HEADER = `x-${BRAND.header("user")}`;

export type ApiResult<K extends EndpointId> =
  | { ok: true; status: number; data: EndpointOutput<K> }
  | { ok: false; status: number; error: string };

/**
 * Calls one API endpoint as a signed-in user.
 *
 * The dashboard goes through the API rather than the database for anything
 * with rules — the monitor interval floor, account limits, SSRF checks — so
 * there is exactly one place those rules live.
 */
export async function callApiAs<K extends EndpointId>(
  userId: string,
  id: K,
  input: Record<string, unknown> = {},
  opts: { timeoutMs?: number } = {},
): Promise<ApiResult<K>> {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret)
    return { ok: false, status: 503, error: "This instance has no internal API secret." };

  const definition = endpoints[id];
  const body = { ...input };
  let path: string = definition.path;
  if ("params" in definition && definition.params) {
    for (const key of Object.keys(definition.params.shape)) {
      path = path.replace(`{${key}}`, encodeURIComponent(String(body[key] ?? "")));
      delete body[key];
    }
  }
  const url = new URL(path, SITE.apiUrl);
  const isGet = definition.method === "get";
  if (isGet) {
    for (const [k, v] of Object.entries(body))
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }

  try {
    const res = await fetch(url, {
      method: definition.method.toUpperCase(),
      headers: {
        "content-type": "application/json",
        [INTERNAL_SECRET_HEADER]: secret,
        [INTERNAL_USER_HEADER]: userId,
      },
      body: isGet || definition.method === "delete" ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
      cache: "no-store",
    });
    const payload = (await res.json().catch(() => null)) as {
      data?: EndpointOutput<K>;
      error?: { message?: string };
    } | null;
    if (!res.ok || !payload?.data) {
      return {
        ok: false,
        status: res.status,
        error: payload?.error?.message ?? `The API answered HTTP ${res.status}.`,
      };
    }
    return { ok: true, status: res.status, data: payload.data };
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    return {
      ok: false,
      status: 504,
      error: timedOut ? "The API took too long to answer." : "The API could not be reached.",
    };
  }
}

/** Headers for code that forwards raw requests, such as the playground. */
export function internalHeaders(userId: string): Record<string, string> | null {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) return null;
  return { [INTERNAL_SECRET_HEADER]: secret, [INTERNAL_USER_HEADER]: userId };
}
