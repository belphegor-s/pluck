import "server-only";
import { members, organizations, users } from "@pluck/db";
import type { Role } from "@pluck/shared";
import { and, asc, eq } from "drizzle-orm";
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
  image: string | null;
  role: Role;
  credits: number;
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
}

/**
 * The signed-in user, once per request. Name and picture are read fresh: the
 * session cache would show an old one for minutes after a profile edit.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;
  const [profile] = await db
    .select({ name: users.name, image: users.image })
    .from(users)
    .where(eq(users.id, session.user.id));
  if (!profile) return null;
  return {
    id: session.user.id,
    name: profile.name,
    email: session.user.email,
    emailVerified: session.user.emailVerified,
    image: profile.image ?? null,
  };
});

export async function listWorkspaces(userId: string): Promise<Workspace[]> {
  return db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      image: organizations.image,
      role: members.role,
      credits: organizations.credits,
    })
    .from(members)
    .innerJoin(organizations, eq(organizations.id, members.orgId))
    .where(eq(members.userId, userId))
    .orderBy(asc(organizations.name));
}

export interface WorkspaceContext {
  user: SessionUser;
  workspace: Workspace;
  workspaces: Workspace[];
}

/**
 * The signed-in user and the workspace they are working in, once per request;
 * null when signed out or not yet in any workspace.
 *
 * The cookie only chooses among workspaces the user belongs to; an id they
 * are not a member of is ignored, so it can never widen access.
 */
export const getWorkspace = cache(async (): Promise<WorkspaceContext | null> => {
  const user = await getSessionUser();
  if (!user) return null;
  const workspaces = await listWorkspaces(user.id);
  const chosen = (await cookies()).get(WORKSPACE_COOKIE)?.value;
  const workspace = workspaces.find((w) => w.id === chosen) ?? workspaces[0];
  if (!workspace) return null;
  return { user, workspace, workspaces };
});

/**
 * For dashboard pages: the context, or off to sign in, or, for someone
 * signed in without a workspace yet, off to name one.
 */
export async function requireWorkspace(next = "/dashboard"): Promise<WorkspaceContext> {
  const ctx = await getWorkspace();
  if (ctx) return ctx;
  if (await getSessionUser()) redirect("/onboarding");
  redirect(`/login?next=${encodeURIComponent(next)}`);
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
