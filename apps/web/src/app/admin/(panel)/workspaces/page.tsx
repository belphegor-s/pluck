import { OWNER_ORG_ID } from "@pluck/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { Pager, SearchBox } from "@/components/admin/search-box";
import { Card, dateTime, Empty, formatNumber, PageTitle, Table } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin/auth";
import { db } from "@/lib/db";
import { timeAgo } from "@/lib/format";

export const metadata: Metadata = { title: "Workspaces" };

const PER_PAGE = 50;

export default async function AdminWorkspaces({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const q = (params.q ?? "").trim().slice(0, 100);
  const page = Math.max(1, Number(params.page) || 1);
  const like = `%${q.replace(/[%_\\]/g, "\\$&")}%`;
  const sql = db.$client;

  const rows = await sql`
    select o.id, o.name, o.credits, o.created_at,
           (select count(*) from member m where m.org_id = o.id) as members,
           (select count(*) from api_key k where k.org_id = o.id and k.revoked_at is null) as keys,
           (select count(*) from monitor mo where mo.org_id = o.id and mo.active) as monitors,
           (select max(u.created_at) from usage_event u where u.org_id = o.id) as last_used,
           (select coalesce(sum(amount_usd_cents), 0) from credit_ledger l
              where l.org_id = o.id and l.reason = 'purchase') as paid_cents,
           (select u.email from member m join "user" u on u.id = m.user_id
              where m.org_id = o.id and m.role = 'owner' order by m.created_at limit 1) as owner
    from organization o
    where o.id <> ${OWNER_ORG_ID} and ${q ? sql`(o.name ilike ${like} or o.id = ${q} or exists (select 1 from member m join "user" u on u.id = m.user_id where m.org_id = o.id and u.email ilike ${like}))` : sql`true`}
    order by o.created_at desc
    limit ${PER_PAGE + 1} offset ${(page - 1) * PER_PAGE}`;

  const list = rows.slice(0, PER_PAGE);

  return (
    <>
      <PageTitle
        title="Workspaces"
        description="Every workspace, with its balance and activity. The system workspace behind the homepage demo is hidden."
      >
        <SearchBox placeholder="Search by name, id or member email" value={q} />
      </PageTitle>
      <Card title={q ? `Matching "${q}"` : "All workspaces"} flush>
        {list.length === 0 ? (
          <Empty>{q ? "No workspace matches that search." : "No workspaces yet."}</Empty>
        ) : (
          <Table
            head={[
              "Workspace",
              "Owner",
              "Balance",
              "Paid",
              "Members",
              "Keys",
              "Monitors",
              "Last used",
              "Created",
            ]}
          >
            {list.map((w) => (
              <tr key={w.id} className="hover:bg-[var(--paper)]">
                <td className="min-w-44">
                  <Link
                    href={`/admin/workspaces/${w.id}`}
                    className="font-medium hover:text-[var(--accent)]"
                  >
                    {w.name}
                  </Link>
                  <span className="mono block text-xs text-[var(--ink-faint)]">{w.id}</span>
                </td>
                <td className="text-[var(--ink-soft)]">{(w.owner as string | null) ?? "None"}</td>
                <td className="tabular-nums">{formatNumber(Number(w.credits))}</td>
                <td className="tabular-nums">
                  {Number(w.paid_cents) ? `$${(Number(w.paid_cents) / 100).toFixed(2)}` : "None"}
                </td>
                <td className="tabular-nums">{String(w.members)}</td>
                <td className="tabular-nums">{String(w.keys)}</td>
                <td className="tabular-nums">{String(w.monitors)}</td>
                <td className="whitespace-nowrap text-[var(--ink-soft)]">
                  {timeAgo(w.last_used as Date | null)}
                </td>
                <td className="whitespace-nowrap text-[var(--ink-soft)]">
                  {dateTime(w.created_at as Date)}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      <Pager page={page} hasMore={rows.length > PER_PAGE} base="/admin/workspaces" params={{ q }} />
    </>
  );
}
