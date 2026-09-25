import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { CreditForm } from "@/components/admin/credit-form";
import {
  Badge,
  Card,
  dateTime,
  Empty,
  formatNumber,
  Kpi,
  ms,
  Table,
  usd,
} from "@/components/admin/ui";
import { revokeKeyAction } from "@/lib/admin/actions";
import { requireAdmin } from "@/lib/admin/auth";
import { db } from "@/lib/db";
import { timeAgo } from "@/lib/format";

export const metadata: Metadata = { title: "Workspace" };

export default async function AdminWorkspace({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const sql = db.$client;

  const [org] =
    await sql`select id, name, slug, credits, created_at from organization where id = ${id}`;
  if (!org) notFound();

  const [members, keys, ledger, usage, totals, monitors] = await Promise.all([
    sql`select u.id, u.name, u.email, m.role, m.created_at from member m join "user" u on u.id = m.user_id
        where m.org_id = ${id} order by m.created_at`,
    sql`select id, name, prefix, last_used_at, revoked_at, created_at from api_key where org_id = ${id}
        order by revoked_at nulls first, created_at desc`,
    sql`select id, delta, reason, reference, amount_usd_cents, created_at from credit_ledger where org_id = ${id}
        order by created_at desc limit 25`,
    sql`select created_at, endpoint, status, credits, duration_ms, target from usage_event where org_id = ${id}
        order by created_at desc limit 25`,
    sql`select count(*) as requests, coalesce(sum(credits), 0) as credits,
               count(*) filter (where status >= 500) as errors,
               (select coalesce(sum(amount_usd_cents), 0) from credit_ledger where org_id = ${id} and reason = 'purchase') as paid
        from usage_event where org_id = ${id} and created_at > now() - interval '30 days'`,
    sql`select id, name, url, type, interval_minutes, active, consecutive_failures, last_checked_at
        from monitor where org_id = ${id} order by created_at desc limit 20`,
  ]);
  const t = totals[0] ?? {};

  return (
    <>
      <div className="mb-6">
        <Link
          href="/admin/workspaces"
          className="text-sm text-[var(--ink-soft)] hover:text-[var(--ink)]"
        >
          ← Workspaces
        </Link>
        <h1 className="mt-2 text-3xl">{org.name}</h1>
        <p className="mono mt-1 text-sm text-[var(--ink-faint)]">
          {org.id} · created {dateTime(org.created_at as Date)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Kpi label="Balance" value={formatNumber(Number(org.credits))} hint="credits" />
        <Kpi label="Paid" value={usd(Number(t.paid) / 100)} hint="all time" />
        <Kpi
          label="Requests"
          value={formatNumber(Number(t.requests))}
          hint={`${formatNumber(Number(t.credits))} credits, 30 days`}
        />
        <Kpi
          label="Server errors"
          value={formatNumber(Number(t.errors))}
          tone={Number(t.errors) > 0 ? "bad" : "good"}
          hint="30 days"
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[2fr_1fr]">
        <div className="min-w-0 space-y-4">
          <Card title="Members" flush>
            <Table head={["Member", "Role", "Joined"]}>
              {members.map((m) => (
                <tr key={m.id}>
                  <td>
                    {m.name || "Unnamed"}
                    <span className="block text-xs text-[var(--ink-faint)]">{m.email}</span>
                  </td>
                  <td>
                    <Badge tone={m.role === "owner" ? "good" : "plain"}>{m.role}</Badge>
                  </td>
                  <td className="whitespace-nowrap text-[var(--ink-soft)]">
                    {dateTime(m.created_at as Date)}
                  </td>
                </tr>
              ))}
            </Table>
          </Card>

          <Card title="API keys" flush>
            {keys.length === 0 ? (
              <Empty>No keys.</Empty>
            ) : (
              <Table head={["Key", "Last used", "Created", ""]}>
                {keys.map((k) => (
                  <tr key={k.id} className={k.revoked_at ? "opacity-50" : ""}>
                    <td>
                      {k.name}
                      <span className="mono block text-xs text-[var(--ink-faint)]">
                        {k.prefix}…
                      </span>
                    </td>
                    <td className="whitespace-nowrap text-[var(--ink-soft)]">
                      {timeAgo(k.last_used_at as Date | null)}
                    </td>
                    <td className="whitespace-nowrap text-[var(--ink-soft)]">
                      {dateTime(k.created_at as Date)}
                    </td>
                    <td className="text-right">
                      {k.revoked_at ? (
                        <Badge>revoked</Badge>
                      ) : (
                        <ConfirmButton
                          action={revokeKeyAction}
                          fields={{ keyId: String(k.id), orgId: id }}
                          label="Revoke"
                          confirm="Tap again to revoke"
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>

          <Card title="Recent requests" flush>
            {usage.length === 0 ? (
              <Empty>No requests yet.</Empty>
            ) : (
              <Table head={["When", "Endpoint", "Status", "Credits", "Time", "Target"]}>
                {usage.map((u) => (
                  <tr key={`${u.created_at}-${u.endpoint}-${u.target}`}>
                    <td className="whitespace-nowrap text-[var(--ink-soft)]">
                      {dateTime(u.created_at as Date)}
                    </td>
                    <td className="mono">{u.endpoint}</td>
                    <td>
                      <Badge
                        tone={
                          Number(u.status) >= 500
                            ? "bad"
                            : Number(u.status) >= 400
                              ? "plain"
                              : "good"
                        }
                      >
                        {String(u.status)}
                      </Badge>
                    </td>
                    <td className="tabular-nums">{String(u.credits)}</td>
                    <td className="whitespace-nowrap tabular-nums">{ms(Number(u.duration_ms))}</td>
                    <td className="mono max-w-[28rem] truncate text-xs text-[var(--ink-soft)]">
                      {u.target ?? "None"}
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>

          {monitors.length > 0 && (
            <Card title="Monitors" flush>
              <Table head={["Monitor", "Every", "State", "Last checked"]}>
                {monitors.map((m) => (
                  <tr key={m.id}>
                    <td className="min-w-56">
                      {m.name || m.type}
                      <span className="mono block max-w-[28rem] truncate text-xs text-[var(--ink-faint)]">
                        {m.url}
                      </span>
                    </td>
                    <td className="whitespace-nowrap">{String(m.interval_minutes)} min</td>
                    <td>
                      {!m.active ? (
                        <Badge>paused</Badge>
                      ) : Number(m.consecutive_failures) > 0 ? (
                        <Badge tone="bad">{String(m.consecutive_failures)} failures</Badge>
                      ) : (
                        <Badge tone="good">ok</Badge>
                      )}
                    </td>
                    <td className="whitespace-nowrap text-[var(--ink-soft)]">
                      {timeAgo(m.last_checked_at as Date | null)}
                    </td>
                  </tr>
                ))}
              </Table>
            </Card>
          )}
        </div>

        <div className="min-w-0 space-y-4">
          <Card title="Adjust credits">
            <CreditForm orgId={id} balance={Number(org.credits)} />
          </Card>
          <Card title="Credit history" flush>
            {ledger.length === 0 ? (
              <Empty>No credit history.</Empty>
            ) : (
              <Table head={["When", "Kind", "Credits"]}>
                {ledger.map((l) => (
                  <tr key={l.id}>
                    <td className="whitespace-nowrap text-[var(--ink-soft)]">
                      {dateTime(l.created_at as Date)}
                    </td>
                    <td>
                      <Badge
                        tone={
                          l.reason === "purchase" ? "good" : l.reason === "refund" ? "bad" : "plain"
                        }
                      >
                        {l.reason}
                      </Badge>
                      {l.amount_usd_cents !== null && (
                        <span className="ml-1.5 text-xs text-[var(--ink-faint)]">
                          {usd(Number(l.amount_usd_cents) / 100)}
                        </span>
                      )}
                    </td>
                    <td
                      className={`tabular-nums ${Number(l.delta) < 0 ? "text-[var(--accent)]" : ""}`}
                    >
                      {Number(l.delta) > 0 ? "+" : ""}
                      {formatNumber(Number(l.delta))}
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
