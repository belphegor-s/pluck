import { usageEvents, users } from "@pluck/db";
import { CREDIT_USD } from "@pluck/shared";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { headers } from "next/headers";
import Link from "next/link";
import { DeleteAccount } from "@/components/dashboard/delete-account";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatNumber } from "@/lib/format";

export const metadata = { title: "Overview" };
export const dynamic = "force-dynamic";

export default async function DashboardOverview() {
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session!.user.id;
  const since = new Date(Date.now() - 29 * 86_400_000);

  const [[account], daily, recent] = await Promise.all([
    db.select({ credits: users.credits }).from(users).where(eq(users.id, userId)),
    db
      .select({
        date: sql<string>`to_char(date_trunc('day', ${usageEvents.createdAt}), 'YYYY-MM-DD')`,
        requests: sql<number>`count(*)::int`,
        credits: sql<number>`coalesce(sum(${usageEvents.credits}),0)::int`,
      })
      .from(usageEvents)
      .where(and(eq(usageEvents.userId, userId), gte(usageEvents.createdAt, since)))
      .groupBy(sql`1`)
      .orderBy(sql`1`),
    db
      .select({
        endpoint: usageEvents.endpoint,
        status: usageEvents.status,
        credits: usageEvents.credits,
        durationMs: usageEvents.durationMs,
        cached: usageEvents.cached,
        target: usageEvents.target,
        createdAt: usageEvents.createdAt,
      })
      .from(usageEvents)
      .where(eq(usageEvents.userId, userId))
      .orderBy(desc(usageEvents.createdAt))
      .limit(12),
  ]);

  const totals = daily.reduce(
    (acc, d) => ({ requests: acc.requests + d.requests, credits: acc.credits + d.credits }),
    { requests: 0, credits: 0 },
  );
  const peak = Math.max(1, ...daily.map((d) => d.credits));
  const byDate = new Map(daily.map((d) => [d.date, d]));
  const days = Array.from({ length: 30 }, (_, i) => {
    const date = new Date(Date.now() - (29 - i) * 86_400_000).toISOString().slice(0, 10);
    return byDate.get(date) ?? { date, requests: 0, credits: 0 };
  });

  return (
    <div className="space-y-10">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="Credit balance"
          value={formatNumber(account?.credits ?? 0)}
          note={`≈ $${((account?.credits ?? 0) * CREDIT_USD).toFixed(2)} of usage`}
        />
        <Stat label="Requests, 30 days" value={formatNumber(totals.requests)} />
        <Stat label="Credits spent, 30 days" value={formatNumber(totals.credits)} />
      </div>

      <section>
        <h2 className="text-lg">Credits per day</h2>
        <div className="sheet mt-3 flex h-36 items-end gap-[3px] p-3">
          {days.map((d) => (
            <div
              key={d.date}
              title={`${d.date}: ${d.credits} credits, ${d.requests} requests`}
              style={{ height: `${Math.max(2, (d.credits / peak) * 100)}%` }}
              className="flex-1 bg-[var(--accent)] opacity-80"
            />
          ))}
        </div>
        <p className="mt-2 text-xs text-[var(--ink-faint)]">
          {days[0]!.date} to {days.at(-1)!.date}
        </p>
      </section>

      <section>
        <h2 className="text-lg">Latest requests</h2>
        {recent.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--ink-soft)]">
            Nothing yet.{" "}
            <Link
              href="/dashboard/keys"
              className="text-[var(--accent)] underline underline-offset-4"
            >
              Create a key
            </Link>{" "}
            and make your first call.
          </p>
        ) : (
          <div className="sheet mt-3 overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <thead className="text-left text-xs text-[var(--ink-faint)]">
                <tr>
                  {["When", "Endpoint", "Target", "Status", "Credits", "Time"].map((h) => (
                    <th key={h} className="border-b border-[var(--line)] px-3 py-2 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recent.map((row, i) => (
                  <tr
                    key={`${row.createdAt.toISOString()}-${i}`}
                    className="border-b border-[var(--line)] last:border-0"
                  >
                    <td className="mono px-3 py-2 text-xs text-[var(--ink-faint)]">
                      {row.createdAt.toISOString().slice(5, 16).replace("T", " ")}
                    </td>
                    <td className="px-3 py-2">{row.endpoint}</td>
                    <td className="mono max-w-[22ch] truncate px-3 py-2 text-xs text-[var(--ink-soft)]">
                      {row.target ?? "—"}
                    </td>
                    <td
                      className={`mono px-3 py-2 text-xs ${row.status >= 400 ? "text-[var(--accent)]" : "text-[var(--leaf)]"}`}
                    >
                      {row.status}
                    </td>
                    <td className="mono px-3 py-2 text-xs">{row.credits}</td>
                    <td className="mono px-3 py-2 text-xs text-[var(--ink-faint)]">
                      {row.cached ? "cached" : `${row.durationMs} ms`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="border-t border-[var(--line)] pt-6">
        <h2 className="text-lg">Delete account</h2>
        <p className="mt-1 mb-4 max-w-[65ch] text-sm text-[var(--ink-soft)]">
          Removes the account and everything tied to it, straight away.
        </p>
        <DeleteAccount email={session!.user.email} credits={account?.credits ?? 0} />
      </section>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="sheet p-4">
      <p className="text-sm text-[var(--ink-soft)]">{label}</p>
      <p className="mono mt-1 text-2xl">{value}</p>
      {note && <p className="mt-1 text-xs text-[var(--ink-faint)]">{note}</p>}
    </div>
  );
}
