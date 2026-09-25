import type { Metadata } from "next";
import Link from "next/link";
import {
  CreditsChart,
  LatencyChart,
  RequestsChart,
  RevenueChart,
  ShareBar,
} from "@/components/admin/charts";
import {
  Badge,
  bytes,
  Card,
  compact,
  dateTime,
  Empty,
  formatNumber,
  Kpi,
  ms,
  PageTitle,
  RangeTabs,
  Table,
  usd,
} from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin/auth";
import { overview, parseRange, serviceHealth } from "@/lib/admin/stats";
import { timeAgo } from "@/lib/format";

export const metadata: Metadata = { title: "Overview" };

export default async function AdminOverview({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  await requireAdmin();
  const days = parseRange((await searchParams).days);
  const [data, health] = await Promise.all([overview(days), serviceHealth()]);
  const k = data.kpis;
  const errorRate = k.requests ? (k.errors / k.requests) * 100 : 0;
  const cacheRate = k.requests ? (k.cached / k.requests) * 100 : 0;
  const maxEndpoint = Math.max(...data.endpoints.map((e) => e.requests), 0);
  const backlog = health.queues?.reduce((n, q) => n + q.waiting + q.delayed, 0) ?? 0;
  const failedJobs = health.queues?.reduce((n, q) => n + q.failed, 0) ?? 0;

  return (
    <>
      <PageTitle title="Overview" description={`The last ${days} days across every workspace.`}>
        <RangeTabs days={days} base="/admin" />
      </PageTitle>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Kpi
          label="Revenue"
          value={usd(k.revenue)}
          hint={`${k.purchases} purchases · ${usd(k.revenueAll)} all time`}
        />
        <Kpi
          label="Users"
          value={formatNumber(k.users)}
          hint={`+${k.usersNew} new · ${k.workspaces} workspaces`}
        />
        <Kpi
          label="Requests"
          value={compact(k.requests)}
          hint={`${cacheRate.toFixed(0)}% from cache`}
        />
        <Kpi
          label="Server errors"
          value={`${errorRate.toFixed(2)}%`}
          tone={errorRate > 2 ? "bad" : "good"}
          hint={`${formatNumber(k.errors)} 5xx · ${formatNumber(k.clientErrors)} 4xx`}
        />
        <Kpi
          label="Credits used"
          value={compact(k.credits)}
          hint={`${compact(k.creditsOutstanding)} unspent across workspaces`}
        />
        <Kpi label="Latency" value={ms(k.p50)} hint={`p50 · p95 ${ms(k.p95)}`} />
        <Kpi
          label="Active"
          value={formatNumber(k.keysActive)}
          hint={`API keys · ${k.monitorsActive} monitors · ${k.crawlsRunning} crawls`}
        />
        <Kpi
          label="Queues"
          value={health.queues ? formatNumber(backlog) : "?"}
          tone={failedJobs > 0 || !health.queues ? "bad" : "plain"}
          hint={
            health.queues
              ? `waiting · ${formatNumber(failedJobs)} failed jobs`
              : "The API did not answer"
          }
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card title="Requests and errors">
          <RequestsChart data={data.series} />
        </Card>
        <Card title="Revenue and sign-ups">
          <RevenueChart data={data.series} />
        </Card>
        <Card title="Latency">
          <LatencyChart data={data.series} />
        </Card>
        <Card title="Credits used">
          <CreditsChart data={data.series} />
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[3fr_2fr]">
        <Card title="Endpoints" flush>
          {data.endpoints.length === 0 ? (
            <Empty>No requests in this period.</Empty>
          ) : (
            <Table head={["Endpoint", "Share", "Requests", "Credits", "p95", "5xx"]}>
              {data.endpoints.map((e) => (
                <tr key={e.endpoint}>
                  <td className="mono whitespace-nowrap">{e.endpoint}</td>
                  <td className="w-1/4 min-w-24">
                    <ShareBar value={e.requests} max={maxEndpoint} />
                  </td>
                  <td className="tabular-nums">{formatNumber(e.requests)}</td>
                  <td className="tabular-nums">{formatNumber(e.credits)}</td>
                  <td className="whitespace-nowrap tabular-nums">{ms(e.p95)}</td>
                  <td
                    className={`tabular-nums ${e.errors ? "text-[var(--accent)]" : "text-[var(--ink-faint)]"}`}
                  >
                    {formatNumber(e.errors)}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <Card title="System">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
            <div>
              <dt className="text-[var(--ink-faint)]">API</dt>
              <dd className="mt-0.5 flex items-center gap-2">
                <span
                  className={`size-2 rounded-full ${health.api.ok ? "bg-[var(--leaf)]" : "bg-[var(--accent)]"}`}
                />
                {health.api.ok ? `Healthy · ${health.api.ms} ms` : "Not answering"}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--ink-faint)]">Version</dt>
              <dd className="mono mt-0.5">{health.api.version ?? "?"}</dd>
            </div>
            <div>
              <dt className="text-[var(--ink-faint)]">Database</dt>
              <dd className="mt-0.5">{bytes(data.system.dbBytes)}</dd>
            </div>
            <div>
              <dt className="text-[var(--ink-faint)]">Connections</dt>
              <dd className="mt-0.5 tabular-nums">
                {data.system.connections} of {data.system.maxConnections}
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-[var(--ink-faint)]">Postgres</dt>
              <dd className="mono mt-0.5 truncate text-xs">{data.system.version}</dd>
            </div>
          </dl>
          {health.queues && (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="mono text-left text-xs uppercase tracking-wider text-[var(--ink-faint)]">
                    <th className="pb-2 font-normal">Queue</th>
                    <th className="pb-2 font-normal">Workers</th>
                    <th className="pb-2 font-normal">Waiting</th>
                    <th className="pb-2 font-normal">Active</th>
                    <th className="pb-2 font-normal">Failed</th>
                  </tr>
                </thead>
                <tbody>
                  {health.queues.map((q) => (
                    <tr key={q.name} className="border-t border-[var(--line)]">
                      <td className="mono py-2">{q.name}</td>
                      <td
                        className={`py-2 tabular-nums ${q.workers === 0 ? "text-[var(--accent)]" : ""}`}
                      >
                        {q.workers}
                      </td>
                      <td className="py-2 tabular-nums">{q.waiting + q.delayed}</td>
                      <td className="py-2 tabular-nums">{q.active}</td>
                      <td
                        className={`py-2 tabular-nums ${q.failed ? "text-[var(--accent)]" : "text-[var(--ink-faint)]"}`}
                      >
                        {q.failed}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card
          title="Top workspaces"
          flush
          action={
            <Link href="/admin/workspaces" className="text-sm text-[var(--accent)] hover:underline">
              All workspaces
            </Link>
          }
        >
          {data.topWorkspaces.length === 0 ? (
            <Empty>No usage in this period.</Empty>
          ) : (
            <Table head={["Workspace", "Used", "Requests", "Balance", "Last seen"]}>
              {data.topWorkspaces.map((w) => (
                <tr key={w.id}>
                  <td>
                    <Link href={`/admin/workspaces/${w.id}`} className="hover:text-[var(--accent)]">
                      {w.name}
                    </Link>
                  </td>
                  <td className="tabular-nums">{formatNumber(w.used)}</td>
                  <td className="tabular-nums">{formatNumber(w.requests)}</td>
                  <td className="tabular-nums">{formatNumber(w.balance)}</td>
                  <td className="whitespace-nowrap text-[var(--ink-soft)]">
                    {timeAgo(w.lastSeen)}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <Card title="Recent server errors" flush>
          {data.failures.length === 0 ? (
            <Empty>No 5xx responses in this period.</Empty>
          ) : (
            <Table head={["When", "Endpoint", "Status", "Target", "Workspace"]}>
              {data.failures.map((f) => (
                <tr key={`${f.createdAt}-${f.endpoint}-${f.target}`}>
                  <td className="whitespace-nowrap text-[var(--ink-soft)]">
                    {dateTime(f.createdAt)}
                  </td>
                  <td className="mono">{f.endpoint}</td>
                  <td>
                    <Badge tone="bad">{f.status}</Badge>
                  </td>
                  <td className="mono max-w-[24rem] truncate text-xs text-[var(--ink-soft)]">
                    {f.target ?? "None"}
                  </td>
                  <td className="whitespace-nowrap">{f.workspace}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <Card
          title="New users"
          flush
          action={
            <Link href="/admin/users" className="text-sm text-[var(--accent)] hover:underline">
              All users
            </Link>
          }
        >
          {data.signups.length === 0 ? (
            <Empty>No users yet.</Empty>
          ) : (
            <Table head={["User", "Email", "Joined"]}>
              {data.signups.map((u) => (
                <tr key={u.id}>
                  <td className="whitespace-nowrap">{u.name || "Unnamed"}</td>
                  <td className="text-[var(--ink-soft)]">{u.email}</td>
                  <td className="whitespace-nowrap text-[var(--ink-soft)]">
                    {timeAgo(u.createdAt)}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <Card title="Credits in and out" flush>
          {data.purchases.length === 0 ? (
            <Empty>No purchases, refunds or adjustments yet.</Empty>
          ) : (
            <Table head={["When", "Workspace", "Kind", "Credits", "Paid"]}>
              {data.purchases.map((p) => (
                <tr key={p.id}>
                  <td className="whitespace-nowrap text-[var(--ink-soft)]">
                    {dateTime(p.createdAt)}
                  </td>
                  <td>
                    <Link
                      href={`/admin/workspaces/${p.orgId}`}
                      className="hover:text-[var(--accent)]"
                    >
                      {p.workspace}
                    </Link>
                  </td>
                  <td>
                    <Badge
                      tone={
                        p.reason === "purchase" ? "good" : p.reason === "refund" ? "bad" : "plain"
                      }
                    >
                      {p.reason}
                    </Badge>
                  </td>
                  <td className={`tabular-nums ${p.delta < 0 ? "text-[var(--accent)]" : ""}`}>
                    {p.delta > 0 ? "+" : ""}
                    {formatNumber(p.delta)}
                  </td>
                  <td className="tabular-nums">{p.amount === null ? "None" : usd(p.amount)}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>

      {data.contacts.length > 0 && (
        <div className="mt-4">
          <Card title="Contact requests" flush>
            <Table head={["When", "From", "Company", "Volume", "Message"]}>
              {data.contacts.map((c) => (
                <tr key={c.id}>
                  <td className="whitespace-nowrap text-[var(--ink-soft)]">
                    {dateTime(c.createdAt)}
                  </td>
                  <td>
                    <a href={`mailto:${c.email}`} className="hover:text-[var(--accent)]">
                      {c.name}
                    </a>
                    <span className="block text-xs text-[var(--ink-faint)]">{c.email}</span>
                  </td>
                  <td>{c.company ?? "None"}</td>
                  <td>{c.volume ?? "None"}</td>
                  <td className="min-w-64 text-[var(--ink-soft)]">{c.message}</td>
                </tr>
              ))}
            </Table>
          </Card>
        </div>
      )}
    </>
  );
}
