import { monitorChanges, monitors } from "@pluck/db";
import { desc, eq, sql } from "drizzle-orm";
import { headers } from "next/headers";
import Link from "next/link";
import { CodeBlock } from "@/components/code-tabs";
import {
  CreateMonitorForm,
  intervalLabel,
  MonitorRowActions,
} from "@/components/dashboard/monitor-forms";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatNumber, timeAgo } from "@/lib/format";
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
      webhook: monitors.webhook,
      lastCheckedAt: monitors.lastCheckedAt,
      lastChangedAt: monitors.lastChangedAt,
      lastError: monitors.lastError,
      consecutiveFailures: monitors.consecutiveFailures,
      changes: sql<number>`(select count(*) from ${monitorChanges} where ${monitorChanges.monitorId} = ${monitors.id})::int`,
    })
    .from(monitors)
    .where(eq(monitors.userId, session!.user.id))
    .orderBy(desc(monitors.createdAt))
    .limit(200);

  const active = rows.filter((r) => r.active).length;
  const failing = rows.filter((r) => r.active && r.consecutiveFailures > 0).length;

  return (
    <div className="space-y-10">
      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-lg">Monitors</h2>
          {rows.length > 0 && (
            <p className="text-sm text-[var(--ink-soft)]">
              {active} watching
              {failing > 0 && <span className="text-[var(--accent)]"> · {failing} failing</span>}
            </p>
          )}
        </div>
        <p className="mt-1 max-w-[65ch] text-sm text-[var(--ink-soft)]">
          A monitor re-reads a page, a sitemap or an extraction on a schedule and records every
          change, optionally calling your webhook. Each check costs the credits of the read it
          performs.
        </p>

        {rows.length > 0 && (
          <div className="sheet mt-4 overflow-x-auto">
            <table className="w-full min-w-[44rem] text-sm">
              <thead className="text-left text-xs text-[var(--ink-faint)]">
                <tr>
                  {["Monitor", "Checks", "Last checked", "Changes", "Status", ""].map((h) => (
                    <th key={h} className="border-b border-[var(--line)] px-3 py-2 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-[var(--line)] last:border-0">
                    <td className="max-w-[18rem] px-3 py-2.5">
                      <Link
                        href={`/dashboard/monitors/${row.id}`}
                        className="block truncate font-medium hover:text-[var(--accent)]"
                      >
                        {row.name || row.url.replace(/^https?:\/\//, "")}
                      </Link>
                      <span className="mono block truncate text-xs text-[var(--ink-faint)]">
                        {row.type} · {row.url.replace(/^https?:\/\//, "")}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-[var(--ink-soft)]">
                      {intervalLabel(row.intervalMinutes)}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-[var(--ink-soft)]">
                      {timeAgo(row.lastCheckedAt)}
                    </td>
                    <td className="mono px-3 py-2.5 text-xs">
                      {row.changes > 0 ? (
                        <Link
                          href={`/dashboard/monitors/${row.id}`}
                          className="text-[var(--accent)] underline underline-offset-4"
                        >
                          {formatNumber(row.changes)}
                        </Link>
                      ) : (
                        <span className="text-[var(--ink-faint)]">0</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      <MonitorStatus row={row} />
                    </td>
                    <td className="px-3 py-2.5">
                      <MonitorRowActions id={row.id} active={row.active} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg">{rows.length === 0 ? "Watch your first page" : "New monitor"}</h2>
        <div className="mt-4">
          <CreateMonitorForm />
        </div>
      </section>

      <section className="border-t border-[var(--line)] pt-6">
        <h3 className="text-sm font-semibold">From your code</h3>
        <p className="mt-1 text-sm text-[var(--ink-soft)]">
          Everything here is also the API. See the{" "}
          <Link href="/docs/monitors" className="text-[var(--accent)] underline underline-offset-4">
            monitor docs
          </Link>{" "}
          and{" "}
          <Link
            href="/dashboard/webhooks"
            className="text-[var(--accent)] underline underline-offset-4"
          >
            webhook deliveries
          </Link>
          .
        </p>
        <CodeBlock
          className="mt-3"
          language="bash"
          code={`curl -X POST ${SITE.apiUrl}/v1/monitors \\
  -H "Authorization: Bearer $PLUCK_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"type":"page","url":"https://example.com/pricing",
       "intervalMinutes":1440,"webhook":"https://you.example.com/hooks/pluck"}'`}
        />
      </section>
    </div>
  );
}

function MonitorStatus({
  row,
}: {
  row: { active: boolean; consecutiveFailures: number; lastError: string | null };
}) {
  if (!row.active) return <span className="text-[var(--ink-faint)]">paused</span>;
  if (row.consecutiveFailures > 0)
    return (
      <span className="text-[var(--accent)]" title={row.lastError ?? undefined}>
        failing ×{row.consecutiveFailures}
      </span>
    );
  return <span className="text-[var(--leaf)]">watching</span>;
}
