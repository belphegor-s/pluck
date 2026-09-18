import { monitorChanges, monitors } from "@pluck/db";
import { desc, eq, sql } from "drizzle-orm";
import { headers } from "next/headers";
import Link from "next/link";
import { CodeBlock } from "@/components/code-tabs";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { SITE } from "@/lib/site";

export const metadata = { title: "Monitors" };
export const dynamic = "force-dynamic";

export default async function MonitorsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const rows = await db
    .select({
      id: monitors.id,
      name: monitors.name,
      type: monitors.type,
      url: monitors.url,
      intervalMinutes: monitors.intervalMinutes,
      active: monitors.active,
      lastCheckedAt: monitors.lastCheckedAt,
      lastChangedAt: monitors.lastChangedAt,
      lastError: monitors.lastError,
      changes: sql<number>`(select count(*) from ${monitorChanges} where ${monitorChanges.monitorId} = ${monitors.id})::int`,
    })
    .from(monitors)
    .where(eq(monitors.userId, session!.user.id))
    .orderBy(desc(monitors.createdAt))
    .limit(100);

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-lg">Monitors</h2>
        <p className="mt-1 max-w-[65ch] text-sm text-[var(--ink-soft)]">
          A monitor re-reads a page, a sitemap or an extraction on a schedule and calls your webhook
          when the result changes. Create them through the API.
        </p>
      </section>

      {rows.length === 0 ? (
        <div className="sheet p-6">
          <p className="text-sm text-[var(--ink-soft)]">
            No monitors yet. Watch a pricing page for changes:
          </p>
          <CodeBlock
            className="mt-3 border-0 p-0"
            language="bash"
            code={`curl -X POST ${SITE.apiUrl}/v1/monitors \\
  -H "Authorization: Bearer $PLUCK_API_KEY" \\
  -d '{"type":"page","url":"https://example.com/pricing",
       "intervalMinutes":1440,"webhook":"https://you.example.com/hooks/pluck"}'`}
          />
          <Link
            href="/docs/monitors"
            className="mt-3 inline-block text-sm text-[var(--accent)] underline underline-offset-4"
          >
            Monitor docs
          </Link>
        </div>
      ) : (
        <div className="sheet overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <thead className="text-left text-xs text-[var(--ink-faint)]">
              <tr>
                {["Name", "Type", "URL", "Every", "Last checked", "Changes", "State"].map((h) => (
                  <th key={h} className="border-b border-[var(--line)] px-3 py-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-[var(--line)] last:border-0">
                  <td className="px-3 py-2">{row.name ?? "—"}</td>
                  <td className="px-3 py-2 text-xs">{row.type}</td>
                  <td className="mono max-w-[26ch] truncate px-3 py-2 text-xs text-[var(--ink-soft)]">
                    {row.url}
                  </td>
                  <td className="mono px-3 py-2 text-xs">{formatInterval(row.intervalMinutes)}</td>
                  <td className="mono px-3 py-2 text-xs text-[var(--ink-faint)]">
                    {row.lastCheckedAt?.toISOString().slice(5, 16).replace("T", " ") ?? "—"}
                  </td>
                  <td className="mono px-3 py-2 text-xs">{row.changes}</td>
                  <td className="px-3 py-2 text-xs">
                    {row.active ? (
                      <span className="text-[var(--leaf)]">running</span>
                    ) : (
                      <span className="text-[var(--accent)]">{row.lastError ?? "paused"}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const formatInterval = (minutes: number) =>
  minutes % 1440 === 0
    ? `${minutes / 1440}d`
    : minutes % 60 === 0
      ? `${minutes / 60}h`
      : `${minutes}m`;
