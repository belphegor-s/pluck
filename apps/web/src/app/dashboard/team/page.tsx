import { invitations, members, users } from "@pluck/db";
import { and, asc, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { InviteForm, MemberControls, RevokeInvitation } from "@/components/dashboard/team-forms";
import { db } from "@/lib/db";
import { timeAgo } from "@/lib/format";
import { can, requireWorkspace, roleLabel } from "@/lib/workspace";

export const metadata = { title: "Team" };
export const dynamic = "force-dynamic";

const ROLES = [
  ["Owner", "Everything, including deleting the workspace and making other owners."],
  [
    "Admin",
    "Invites and removes people, buys credits, manages model keys, proxies and the signing secret.",
  ],
  ["Member", "Creates API keys, runs the playground, and manages monitors and webhooks."],
] as const;

export default async function TeamPage() {
  const { user, workspace } = await requireWorkspace("/dashboard/team");

  const manage = can.manageMembers(workspace.role);
  const [people, pending] = await Promise.all([
    db
      .select({
        id: members.id,
        userId: members.userId,
        role: members.role,
        joinedAt: members.createdAt,
        name: users.name,
        email: users.email,
        image: users.image,
      })
      .from(members)
      .innerJoin(users, eq(users.id, members.userId))
      .where(eq(members.orgId, workspace.id))
      // Owners first, then admins, then members; alphabetical within each.
      .orderBy(
        sql`case ${members.role} when 'owner' then 0 when 'admin' then 1 else 2 end`,
        asc(users.name),
      ),
    manage
      ? db
          .select({
            id: invitations.id,
            email: invitations.email,
            role: invitations.role,
            expiresAt: invitations.expiresAt,
            createdAt: invitations.createdAt,
            invitedBy: users.name,
          })
          .from(invitations)
          .leftJoin(users, eq(users.id, invitations.invitedBy))
          .where(
            and(
              eq(invitations.orgId, workspace.id),
              isNull(invitations.acceptedAt),
              isNull(invitations.revokedAt),
              gt(invitations.expiresAt, new Date()),
            ),
          )
          .orderBy(desc(invitations.createdAt))
      : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-10">
      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-lg">People in {workspace.name}</h2>
          <p className="text-sm text-[var(--ink-soft)]">
            {people.length} {people.length === 1 ? "person" : "people"}
          </p>
        </div>
        <div className="sheet mt-4 overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead className="text-left text-xs text-[var(--ink-faint)]">
              <tr>
                {["Person", "Joined", "Role"].map((h) => (
                  <th
                    key={h}
                    className={`border-b border-[var(--line)] px-3 py-2 font-medium ${h === "Role" ? "text-right" : ""}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {people.map((person) => {
                const self = person.userId === user.id;
                return (
                  <tr key={person.id} className="border-b border-[var(--line)] last:border-0">
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-3">
                        {person.image ? (
                          // biome-ignore lint/performance/noImgElement: a small GitHub avatar.
                          <img
                            src={person.image}
                            alt=""
                            width={28}
                            height={28}
                            referrerPolicy="no-referrer"
                            className="size-7 shrink-0 rounded-full border border-[var(--line)]"
                          />
                        ) : (
                          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent-wash)] text-xs text-[var(--accent)]">
                            {(person.name || person.email).charAt(0).toUpperCase()}
                          </span>
                        )}
                        <span className="min-w-0">
                          <span className="block truncate">
                            {person.name || person.email}
                            {self && <span className="text-[var(--ink-faint)]"> (you)</span>}
                          </span>
                          <span className="block truncate text-xs text-[var(--ink-faint)]">
                            {person.email}
                          </span>
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-[var(--ink-soft)]">
                      {timeAgo(person.joinedAt)}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {manage ? (
                        <MemberControls
                          id={person.id}
                          role={person.role}
                          canEditOwner={can.assignOwner(workspace.role)}
                          isSelf={self}
                        />
                      ) : (
                        <span className="text-xs text-[var(--ink-soft)]">
                          {roleLabel[person.role]}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {manage ? (
        <>
          <section>
            <h2 className="text-lg">Invite someone</h2>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">
              They get an email with a link that works for 7 days, and only for the GitHub account
              whose verified email matches.
            </p>
            <div className="mt-4">
              <InviteForm />
            </div>
          </section>

          {pending.length > 0 && (
            <section>
              <h2 className="text-lg">Waiting to join</h2>
              <div className="sheet mt-4 overflow-x-auto">
                <table className="w-full min-w-[36rem] text-sm">
                  <tbody>
                    {pending.map((invite) => (
                      <tr key={invite.id} className="border-b border-[var(--line)] last:border-0">
                        <td className="px-3 py-2.5">
                          <span className="block">{invite.email}</span>
                          <span className="block text-xs text-[var(--ink-faint)]">
                            {roleLabel[invite.role]}
                            {invite.invitedBy && ` · invited by ${invite.invitedBy}`}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-[var(--ink-soft)]">
                          expires {timeAgo(invite.expiresAt)}
                        </td>
                        <td className="px-3 py-2.5">
                          <RevokeInvitation id={invite.id} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      ) : (
        <p className="text-sm text-[var(--ink-soft)]">
          Owners and admins invite and manage people. Ask one of them to add someone.
        </p>
      )}

      <section className="border-t border-[var(--line)] pt-6">
        <h3 className="text-sm font-semibold">What each role can do</h3>
        <dl className="mt-3 grid gap-3 sm:grid-cols-3">
          {ROLES.map(([role, text]) => (
            <div key={role} className="sheet p-3">
              <dt className="text-sm font-medium">{role}</dt>
              <dd className="mt-1 text-xs text-[var(--ink-soft)]">{text}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
