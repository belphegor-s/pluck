import { SITE } from "@/lib/site";

// RFC 9116. Expires is required and must stay in the future, so it is
// computed per request rather than hardcoded.
export const dynamic = "force-dynamic";

export function GET() {
  const expires = new Date(Date.now() + 180 * 86_400_000).toISOString();
  const body = [
    `Contact: mailto:${SITE.contactEmail}`,
    `Expires: ${expires}`,
    "Preferred-Languages: en",
    `Policy: ${SITE.url}/trust#disclosure`,
    `Canonical: ${SITE.url}/.well-known/security.txt`,
    "",
  ].join("\n");
  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=86400",
    },
  });
}
