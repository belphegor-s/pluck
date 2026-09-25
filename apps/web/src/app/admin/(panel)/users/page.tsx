import type { Metadata } from "next";
import Link from "next/link";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { Pager, SearchBox } from "@/components/admin/search-box";
import { Card, dateTime, Empty, PageTitle, Table } from "@/components/admin/ui";
import { signOutUserAction } from "@/lib/admin/actions";
import { requireAdmin } from "@/lib/admin/auth";
import { db } from "@/lib/db";
import { timeAgo } from "@/lib/format";

export const metadata: Metadata = { title: "Users" };

const PER_PAGE = 50;

export default async function AdminUsers({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const q = (params.q ?? "").trim().slice(0, 100);
  const page = Math.max(1, Number(params.page) || 1);
  const like = `%${q.replace(/[%_\\]/g, "\\$&")}%`;

  const rows = await db.$client`
    select u.id, u.name, u.email, u.image, u.created_at,
           (select count(*) from session s where s.user_id = u.id and s.expires_at > now()) as sessions,
           (select max(s.updated_at) from session s where s.user_id = u.id) as last_active,
           coalesce(json_agg(json_build_object('id', o.id, 'name', o.name, 'role', m.role)
                    order by m.created_at) filter (where o.id is not null), '[]') as workspaces
    from "user" u
    left join member m on m.user_id = u.id
    left join organization o on o.id = m.org_id
    where ${q ? db.$client`(u.email ilike ${like} or u.name ilike ${like} or u.id = ${q})` : db.$client`true`}
    group by u.id
    order by u.created_at desc
    limit ${PER_PAGE + 1} offset ${(page - 1) * PER_PAGE}`;

  const users = rows.slice(0, PER_PAGE);

  return (
    <>
      <PageTitle title="Users" description="Everyone with an account, newest first.">
        <SearchBox placeholder="Search by name, email or id" value={q} />
      </PageTitle>
      <Card title={q ? `Matching "${q}"` : "All users"} flush>
        {users.length === 0 ? (
          <Empty>{q ? "Nobody matches that search." : "No users yet."}</Empty>
        ) : (
          <Table head={["User", "Workspaces", "Sessions", "Last active", "Joined", ""]}>
            {users.map((u) => {
              const workspaces = u.workspaces as { id: string; name: string; role: string }[];
              return (
                <tr key={u.id}>
                  <td className="min-w-56">
                    <div className="flex items-center gap-3">
                      {u.image ? (
                        // biome-ignore lint/performance/noImgElement: small remote avatar.
                        <img
                          src={u.image}
                          alt=""
                          referrerPolicy="no-referrer"
                          className="size-8 shrink-0 rounded-full border border-[var(--line)]"
                        />
                      ) : (
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent-wash)] text-xs text-[var(--accent)]">
                          {(u.name || u.email).charAt(0).toUpperCase()}
                        </span>
                      )}
                      <div className="min-w-0">
                        <p className="truncate">{u.name || "Unnamed"}</p>
                        <p className="truncate text-xs text-[var(--ink-faint)]">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="min-w-48">
                    {workspaces.length === 0 ? (
                      <span className="text-[var(--ink-faint)]">None</span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {workspaces.map((w) => (
                          <Link
                            key={w.id}
                            href={`/admin/workspaces/${w.id}`}
                            className="border border-[var(--line)] px-1.5 py-0.5 text-xs hover:border-[var(--accent)] hover:text-[var(--accent)]"
                          >
                            {w.name}
                            <span className="ml-1 text-[var(--ink-faint)]">{w.role}</span>
                          </Link>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="tabular-nums">{String(u.sessions)}</td>
                  <td className="whitespace-nowrap text-[var(--ink-soft)]">
                    {timeAgo(u.last_active as Date | null)}
                  </td>
                  <td className="whitespace-nowrap text-[var(--ink-soft)]">
                    {dateTime(u.created_at as Date)}
                  </td>
                  <td className="text-right">
                    {Number(u.sessions) > 0 && (
                      <ConfirmButton
                        action={signOutUserAction}
                        fields={{ userId: String(u.id) }}
                        label="Sign out everywhere"
                        confirm="Tap again to sign out"
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
      <Pager page={page} hasMore={rows.length > PER_PAGE} base="/admin/users" params={{ q }} />
    </>
  );
}
