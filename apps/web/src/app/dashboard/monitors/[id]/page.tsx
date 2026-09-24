import { monitorChanges, monitors } from "@pluck/db";
import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EditMonitorForm, MonitorRowActions } from "@/components/dashboard/monitor-forms";
import { DiffView } from "@/components/diff-view";
import { db } from "@/lib/db";
import { timeAgo } from "@/lib/format";
import { intervalLabel } from "@/lib/monitors";
import { requireWorkspace } from "@/lib/workspace";

export const metadata = { title: "Monitor" };
export const dynamic = "force-dynamic";

const CHANGES_SHOWN = 30;

export default async function MonitorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { workspace } = await requireWorkspace();
  const [monitor] = await db
    .select()
    .from(monitors)
    .where(and(eq(monitors.id, id), eq(monitors.orgId, workspace.id)));
  if (!monitor) notFound();

  const changes = await db
    .select()
    .from(monitorChanges)
    .where(eq(monitorChanges.monitorId, id))
    .orderBy(desc(monitorChanges.detectedAt))
    .limit(CHANGES_SHOWN);

  const facts = [
    { label: "Type", value: monitor.type },
    { label: "Checks", value: intervalLabel(monitor.intervalMinutes) },
    { label: "Last checked", value: timeAgo(monitor.lastCheckedAt) },
    { label: "Last changed", value: timeAgo(monitor.lastChangedAt) },
    {
      label: "Next check",
      value: monitor.active ? timeAgo(monitor.nextRunAt) : "paused",
    },
    { label: "Webhook", value: monitor.webhook ? "on" : "off" },
  ];

  return (
    <div className="space-y-10">
      <section>
        <Link
          href="/dashboard/monitors"
          className="text-sm text-[var(--ink-soft)] hover:text-[var(--ink)]"
        >
          ← Monitors
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg">{monitor.name || "Untitled monitor"}</h2>
            <a
              href={monitor.url}
              target="_blank"
              rel="noreferrer"
              className="mono block truncate text-xs text-[var(--ink-faint)] hover:text-[var(--accent)]"
            >
              {monitor.url}
            </a>
          </div>
          <MonitorRowActions id={monitor.id} active={monitor.active} />
        </div>

        {monitor.consecutiveFailures > 0 && monitor.lastError && (
          <p className="sheet mt-4 border-[var(--accent)] p-3 text-sm text-[var(--accent)]">
            The last {monitor.consecutiveFailures} check
            {monitor.consecutiveFailures === 1 ? "" : "s"} failed: {monitor.lastError}
          </p>
        )}

        <dl className="mt-4 grid grid-cols-2 gap-px border border-[var(--line)] bg-[var(--line)] sm:grid-cols-3 lg:grid-cols-6">
          {facts.map((fact) => (
            <div key={fact.label} className="bg-[var(--paper)] px-3 py-2.5">
              <dt className="text-xs text-[var(--ink-faint)]">{fact.label}</dt>
              <dd className="mt-0.5 text-sm">{fact.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section>
        <h3 className="text-base">Changes</h3>
        {changes.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--ink-soft)]">
            Nothing has changed since the first check. The first check records a baseline; changes
            appear here from the second one on.
          </p>
        ) : (
          <ol className="mt-3 space-y-4">
            {changes.map((change) => (
              <li key={change.id} className="sheet overflow-hidden">
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--line)] px-3 py-2">
                  <span className="text-sm">{change.summary ?? "Changed"}</span>
                  <time
                    dateTime={change.detectedAt.toISOString()}
                    className="text-xs text-[var(--ink-faint)]"
                  >
                    {timeAgo(change.detectedAt)}
                  </time>
                </div>
                {change.diff ? (
                  <DiffView diff={change.diff} className="max-h-96 overflow-y-auto py-2" />
                ) : (
                  <SetDiff added={change.added} removed={change.removed} />
                )}
              </li>
            ))}
          </ol>
        )}
        {changes.length === CHANGES_SHOWN && (
          <p className="mt-3 text-xs text-[var(--ink-faint)]">
            Showing the latest {CHANGES_SHOWN}. The full history is at{" "}
            <code className="mono">GET /v1/monitors/{monitor.id}/changes</code>.
          </p>
        )}
      </section>

      <section className="border-t border-[var(--line)] pt-6">
        <h3 className="text-base">Settings</h3>
        <div className="mt-4">
          <EditMonitorForm monitor={monitor} />
        </div>
      </section>
    </div>
  );
}

/** Sitemap monitors record which URLs came and went rather than a text diff. */
function SetDiff({ added, removed }: { added: string[] | null; removed: string[] | null }) {
  const rows = [
    ...(added ?? []).map((url) => ({ url, kind: "add" as const })),
    ...(removed ?? []).map((url) => ({ url, kind: "remove" as const })),
  ];
  if (rows.length === 0) return null;
  return (
    <ul className="mono max-h-96 overflow-y-auto py-2 text-xs">
      {rows.map((row) => (
        <li
          key={`${row.kind}:${row.url}`}
          className={`truncate px-3 ${row.kind === "add" ? "text-[var(--leaf)]" : "text-[var(--accent)]"}`}
        >
          {row.kind === "add" ? "+" : "−"} {row.url}
        </li>
      ))}
    </ul>
  );
}
