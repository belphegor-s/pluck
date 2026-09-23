import "server-only";
import { members, organizations, users } from "@pluck/db";
import type { Role } from "@pluck/shared";
import { and, asc, desc, eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

/** Which workspace the dashboard is showing. Checked against membership on every read. */
export const WORKSPACE_COOKIE = "pluck-workspace";

export { can, type Role, roleLabel } from "@pluck/shared";

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  personal: boolean;
  role: Role;
  credits: number;
}

/**
 * Every user has a personal workspace whose id is their user id. Created at
 * sign-up; this is the fallback for anyone who signed up while the rest of
 * the system was mid-deploy.
 */
export async function ensurePersonalWorkspace(userId: string): Promise<void> {
  await db
    .insert(organizations)
    .values({ id: userId, name: "Personal", slug: userId.toLowerCase(), personal: true })
    .onConflictDoNothing();
  await db
    .insert(members)
    .values({ id: `mem_${userId}`, orgId: userId, userId, role: "owner" })
    .onConflictDoNothing();
}

export async function listWorkspaces(userId: string): Promise<Workspace[]> {
  return db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      personal: organizations.personal,
      role: members.role,
      credits: organizations.credits,
    })
    .from(members)
    .innerJoin(organizations, eq(organizations.id, members.orgId))
    .where(eq(members.userId, userId))
    .orderBy(desc(organizations.personal), asc(organizations.name));
}

export interface WorkspaceContext {
  user: { id: string; name: string; email: string; emailVerified: boolean; image: string | null };
  workspace: Workspace;
  workspaces: Workspace[];
}

/**
 * The signed-in user and the workspace they are working in, once per request.
 *
 * The cookie only chooses among workspaces the user belongs to; an id they
 * are not a member of is ignored, so it can never widen access.
 */
export const getWorkspace = cache(async (): Promise<WorkspaceContext | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;
  const user = session.user;

  // Name and picture are read fresh: the session cache would show an old one
  // for minutes after a profile edit.
  const [[profile], initial] = await Promise.all([
    db.select({ name: users.name, image: users.image }).from(users).where(eq(users.id, user.id)),
    listWorkspaces(user.id),
  ]);
  if (!profile) return null;
  let workspaces = initial;
  if (!workspaces.some((w) => w.personal)) {
    await ensurePersonalWorkspace(user.id);
    workspaces = await listWorkspaces(user.id);
  }
  const chosen = (await cookies()).get(WORKSPACE_COOKIE)?.value;
  const workspace =
    workspaces.find((w) => w.id === chosen) ?? workspaces.find((w) => w.personal) ?? workspaces[0];
  if (!workspace) return null;

  return {
    user: {
      id: user.id,
      name: profile.name,
      email: user.email,
      emailVerified: user.emailVerified,
      image: profile.image ?? null,
    },
    workspace,
    workspaces,
  };
});

/** For pages: the context, or off to sign in. */
export async function requireWorkspace(next = "/dashboard"): Promise<WorkspaceContext> {
  const ctx = await getWorkspace();
  if (!ctx) redirect(`/login?next=${encodeURIComponent(next)}`);
  return ctx;
}

/** A member's row in one workspace, read fresh for anything that changes access. */
export async function membership(orgId: string, userId: string) {
  const [row] = await db
    .select({ id: members.id, role: members.role })
    .from(members)
    .where(and(eq(members.orgId, orgId), eq(members.userId, userId)))
    .limit(1);
  return row ?? null;
}
