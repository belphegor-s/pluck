import { type EndpointId, endpoints } from "@pluck/shared";
import { NextResponse } from "next/server";
import { internalHeaders } from "@/lib/api";
import { SITE } from "@/lib/site";
import { getSessionUser, getWorkspace } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Runs a playground call in the signed-in user's current workspace, which it bills. */
export async function POST(request: Request) {
  const ctx = await getWorkspace();
  if (!ctx) {
    const signedIn = Boolean(await getSessionUser());
    return NextResponse.json(
      {
        error: {
          message: signedIn
            ? "Create a workspace first: open the dashboard to name one."
            : "Sign in to use the playground.",
        },
      },
      { status: signedIn ? 409 : 401 },
    );
  }

  const trust = internalHeaders({ userId: ctx.user.id, orgId: ctx.workspace.id });
  if (!trust)
    return NextResponse.json(
      { error: { message: "The playground is not configured on this instance." } },
      { status: 503 },
    );

  const { endpoint, input } = (await request.json().catch(() => ({}))) as {
    endpoint?: EndpointId;
    input?: Record<string, unknown>;
  };
  const definition = endpoint ? endpoints[endpoint] : undefined;
  if (!definition)
    return NextResponse.json({ error: { message: "Unknown endpoint." } }, { status: 400 });

  const body = { ...(input ?? {}) };
  let path: string = definition.path;
  if ("params" in definition && definition.params) {
    for (const key of Object.keys(definition.params.shape)) {
      path = path.replace(`{${key}}`, encodeURIComponent(String(body[key] ?? "")));
      delete body[key];
    }
  }
  const url = new URL(path, SITE.apiUrl);
  if (definition.method === "get") {
    for (const [k, v] of Object.entries(body))
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }

  const started = Date.now();
  const res = await fetch(url, {
    method: definition.method.toUpperCase(),
    headers: {
      "content-type": "application/json",
      ...trust,
    },
    body: definition.method === "get" ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(180_000),
  }).catch(() => null);

  if (!res)
    return NextResponse.json({ error: { message: "The API did not respond." } }, { status: 502 });
  const payload = await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }));
  return NextResponse.json({ ...payload, elapsedMs: Date.now() - started }, { status: res.status });
}
