import { NextResponse } from "next/server";
import { extensionCors } from "@/lib/extension";
import { SITE } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WINDOW_MS = 60 * 60 * 1000;
const PER_IP = 8;
const hits = new Map<string, number[]>();

function allowed(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 10_000) hits.clear();
  return recent.length <= PER_IP;
}

/** The browser extension offers the same preview before sign-in, from its own origin. */
export function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: extensionCors(request) });
}

export async function POST(request: Request) {
  const response = await demo(request);
  for (const [name, value] of Object.entries(extensionCors(request)))
    response.headers.set(name, value);
  return response;
}

async function demo(request: Request) {
  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "anon";
  const { url } = (await request.json().catch(() => ({}))) as { url?: string };
  if (!url || !/^https?:\/\/\S+\.\S+/i.test(url)) {
    return NextResponse.json(
      { error: "Enter a full URL, like https://example.com" },
      { status: 400 },
    );
  }
  if (!allowed(ip)) {
    return NextResponse.json(
      { error: "Demo limit reached for this hour. Create a free key to keep going." },
      { status: 429 },
    );
  }

  const key = process.env.DEMO_API_KEY;
  if (!key)
    return NextResponse.json(
      { error: "The live demo is not configured on this instance." },
      { status: 503 },
    );

  const started = Date.now();
  const res = await fetch(`${SITE.apiUrl}/v1/scrape`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      url,
      // rawHtml only to show what was thrown away: a few lines and its size.
      formats: ["markdown", "links", "metadata", "rawHtml"],
      maxAge: 3600,
      timeout: 25_000,
    }),
    signal: AbortSignal.timeout(40_000),
  }).catch(() => null);

  const payload = (await res?.json().catch(() => null)) as {
    data?: Record<string, unknown>;
    error?: { message: string };
  } | null;
  if (!res?.ok || !payload?.data) {
    return NextResponse.json(
      { error: payload?.error?.message ?? "That page could not be plucked." },
      { status: 502 },
    );
  }
  const data = payload.data as {
    markdown?: string;
    rawHtml?: string;
    links?: string[];
    metadata?: Record<string, unknown>;
    renderedWith?: string;
  };
  const html = data.rawHtml ?? "";
  return NextResponse.json({
    markdown: (data.markdown ?? "").slice(0, 8_000),
    // Sizes are of the whole page, before either side is cut for the preview.
    markdownBytes: Buffer.byteLength(data.markdown ?? ""),
    htmlBytes: Buffer.byteLength(html),
    html: html
      .replace(/\n\s*\n+/g, "\n")
      .trimStart()
      .slice(0, 2_400),
    links: (data.links ?? []).slice(0, 40),
    metadata: data.metadata,
    renderedWith: data.renderedWith,
    durationMs: Date.now() - started,
  });
}
