import { apiKeys } from "@pluck/db";
import { desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { CodeBlock } from "@/components/code-tabs";
import { CreateKeyForm, RevokeKeyButton } from "@/components/dashboard/forms";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { SITE } from "@/lib/site";

export const metadata = { title: "API keys" };
export const dynamic = "force-dynamic";

export default async function KeysPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const keys = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.userId, session!.user.id))
    .orderBy(desc(apiKeys.createdAt));

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-lg">Create a key</h2>
        <p className="mt-1 max-w-[60ch] text-sm text-[var(--ink-soft)]">
          Keys carry the full permissions of your account. Use a separate key per app so you can
          revoke one without touching the others.
        </p>
        <div className="mt-4">
          <CreateKeyForm />
        </div>
      </section>

      <section>
        <h2 className="text-lg">Your keys</h2>
        {keys.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--ink-soft)]">No keys yet.</p>
        ) : (
          <div className="sheet mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-[var(--ink-faint)]">
                <tr>
                  {["Name", "Key", "Created", "Last used", ""].map((h) => (
                    <th key={h} className="border-b border-[var(--line)] px-3 py-2 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {keys.map((key) => (
                  <tr key={key.id} className="border-b border-[var(--line)] last:border-0">
                    <td className="px-3 py-2">{key.name}</td>
                    <td className="mono px-3 py-2 text-xs text-[var(--ink-soft)]">{key.prefix}…</td>
                    <td className="mono px-3 py-2 text-xs text-[var(--ink-faint)]">
                      {key.createdAt.toISOString().slice(0, 10)}
                    </td>
                    <td className="mono px-3 py-2 text-xs text-[var(--ink-faint)]">
                      {key.lastUsedAt?.toISOString().slice(0, 10) ?? "never"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {key.revokedAt ? (
                        <span className="text-xs text-[var(--ink-faint)]">revoked</span>
                      ) : (
                        <RevokeKeyButton id={key.id} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg">First call</h2>
        <CodeBlock
          className="mt-3"
          language="bash"
          code={`curl -X POST ${SITE.apiUrl}/v1/scrape \\
  -H "Authorization: Bearer ${SITE.apiKeyExample}" \\
  -H "Content-Type: application/json" \\
  -d '{"url":"https://example.com","formats":["markdown"]}'`}
        />
      </section>
    </div>
  );
}
