"use server";

import { randomBytes } from "node:crypto";
import {
  apiKeys,
  creditLedger,
  invitations,
  members,
  newId,
  organizationAvatars,
  organizations,
  users,
} from "@pluck/db";
import { createMailer } from "@pluck/runtime";
import { SIGNUP_GRANT } from "@pluck/shared";
import { and, count, eq, gt, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { encodeAvatar } from "@/lib/avatars";
import { db } from "@/lib/db";
import { hashInviteToken } from "@/lib/invitations";
import { SITE } from "@/lib/site";
import {
  can,
  getSessionUser,
  getWorkspace,
  listWorkspaces,
  type Role,
  roleLabel,
  type SessionUser,
  WORKSPACE_COOKIE,
  type WorkspaceContext,
} from "@/lib/workspace";

export type TeamState = { ok?: string; error?: string; link?: string };

const INVITE_DAYS = 7;
const MAX_PENDING_INVITES = 50;
const MAX_OWNED_WORKSPACES = 10;

const fail = (error: unknown): TeamState => ({
  error: error instanceof Error ? error.message : "Something went wrong.",
});

async function context(): Promise<WorkspaceContext> {
  const ctx = await getWorkspace();
  if (!ctx) throw new Error("Sign in to continue.");
  return ctx;
}

/** For the actions a user without any workspace yet can take. */
async function signedIn(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new Error("Sign in to continue.");
  return user;
}

async function setWorkspaceCookie(orgId: string | null) {
  const jar = await cookies();
  // Leaving the last workspace clears the choice; the dashboard then asks for a new one.
  if (!orgId) return void jar.delete(WORKSPACE_COOKIE);
  jar.set(WORKSPACE_COOKIE, orgId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

/** After leaving or deleting one, the next workspace to show, if there is any. */
async function nextWorkspace(userId: string, except: string) {
  return (await listWorkspaces(userId)).find((w) => w.id !== except)?.id ?? null;
}

/** Owners in a workspace, read inside the transaction making a change. */
async function ownerCount(tx: Pick<typeof db, "select">, orgId: string) {
  const [row] = await tx
    .select({ n: count() })
    .from(members)
    .where(and(eq(members.orgId, orgId), eq(members.role, "owner")));
  return row?.n ?? 0;
}

/* ------------------------------------------------------------------ workspaces */

export async function switchWorkspace(orgId: string): Promise<TeamState> {
  try {
    const ctx = await context();
    if (!ctx.workspaces.some((w) => w.id === orgId))
      return { error: "You are not a member of that workspace." };
    await setWorkspaceCookie(orgId);
    revalidatePath("/dashboard", "layout");
    return { ok: "Switched." };
  } catch (err) {
    return fail(err);
  }
}

const nameSchema = z
  .string()
  .trim()
  .min(2, "Give the workspace a name of at least 2 characters.")
  .max(60, "Keep the name under 60 characters.");

const slugify = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "team";

/**
 * Creates a workspace with the caller as its owner. This is also how everyone
 * starts: after signing up they name their first workspace, and that one
 * receives the sign-up credits. The grant is keyed on the user, so it lands
 * once however many workspaces they go on to create.
 */
export async function createWorkspace(_prev: TeamState, formData: FormData): Promise<TeamState> {
  let id: string;
  try {
    const user = await signedIn();
    const parsed = nameSchema.safeParse(formData.get("name"));
    if (!parsed.success) return { error: parsed.error.issues[0]?.message };
    const owned = (await listWorkspaces(user.id)).filter((w) => w.role === "owner").length;
    if (owned >= MAX_OWNED_WORKSPACES)
      return { error: `You can own up to ${MAX_OWNED_WORKSPACES} workspaces.` };

    id = newId("org");
    const orgId = id;
    await db.transaction(async (tx) => {
      await tx.insert(organizations).values({
        id: orgId,
        name: parsed.data,
        // A short random suffix keeps slugs unique without a lookup race.
        slug: `${slugify(parsed.data)}-${randomBytes(3).toString("hex")}`,
      });
      await tx.insert(members).values({ id: newId("mem"), orgId, userId: user.id, role: "owner" });
      if (SIGNUP_GRANT <= 0) return;
      const granted = await tx
        .insert(creditLedger)
        .values({ orgId, delta: SIGNUP_GRANT, reason: "signup", reference: `signup:${user.id}` })
        .onConflictDoNothing({ target: creditLedger.reference })
        .returning({ id: creditLedger.id });
      if (granted.length)
        await tx
          .update(organizations)
          .set({ credits: sql`${organizations.credits} + ${SIGNUP_GRANT}` })
          .where(eq(organizations.id, orgId));
    });
    await setWorkspaceCookie(id);
  } catch (err) {
    return fail(err);
  }
  revalidatePath("/dashboard", "layout");
  redirect("/dashboard");
}

export async function renameWorkspace(_prev: TeamState, formData: FormData): Promise<TeamState> {
  try {
    const { workspace } = await context();
    if (!can.manageSettings(workspace.role))
      return { error: "Only owners and admins can rename the workspace." };
    const parsed = nameSchema.safeParse(formData.get("name"));
    if (!parsed.success) return { error: parsed.error.issues[0]?.message };
    await db
      .update(organizations)
      .set({ name: parsed.data })
      .where(eq(organizations.id, workspace.id));
    revalidatePath("/dashboard", "layout");
    return { ok: "Renamed." };
  } catch (err) {
    return fail(err);
  }
}

/** A new workspace picture, re-encoded by `encodeAvatar`. Owners and admins only. */
export async function uploadWorkspaceAvatar(
  _prev: TeamState,
  formData: FormData,
): Promise<TeamState> {
  try {
    const { workspace } = await context();
    if (!can.manageSettings(workspace.role))
      return { error: "Only owners and admins can change the workspace picture." };
    const encoded = await encodeAvatar(formData.get("avatar"));
    if (!encoded.ok) return { error: encoded.error };
    const { data, hash } = encoded;
    await db.transaction(async (tx) => {
      await tx
        .insert(organizationAvatars)
        .values({ orgId: workspace.id, data, contentType: "image/webp", hash })
        .onConflictDoUpdate({
          target: organizationAvatars.orgId,
          set: { data, contentType: "image/webp", hash, updatedAt: new Date() },
        });
      await tx
        .update(organizations)
        .set({ image: `/api/workspace-avatar/${workspace.id}?v=${hash}` })
        .where(eq(organizations.id, workspace.id));
    });
    revalidatePath("/dashboard", "layout");
    return { ok: "Picture updated." };
  } catch (err) {
    return fail(err);
  }
}

export async function removeWorkspaceAvatar(
  _prev: TeamState,
  _formData: FormData,
): Promise<TeamState> {
  try {
    const { workspace } = await context();
    if (!can.manageSettings(workspace.role))
      return { error: "Only owners and admins can change the workspace picture." };
    await db.transaction(async (tx) => {
      await tx.delete(organizationAvatars).where(eq(organizationAvatars.orgId, workspace.id));
      await tx.update(organizations).set({ image: null }).where(eq(organizations.id, workspace.id));
    });
    revalidatePath("/dashboard", "layout");
    return { ok: "Picture removed." };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Deletes a workspace and everything in it: keys stop working, monitors stop,
 * remaining credits are forfeited. The name must be typed back.
 */
export async function deleteWorkspace(_prev: TeamState, formData: FormData): Promise<TeamState> {
  try {
    const ctx = await context();
    const { workspace } = ctx;
    if (!can.deleteWorkspace(workspace.role))
      return { error: "Only an owner can delete the workspace." };
    if (String(formData.get("confirm") ?? "").trim() !== workspace.name)
      return { error: "Type the workspace name exactly to confirm." };
    await db.delete(organizations).where(eq(organizations.id, workspace.id));
    await setWorkspaceCookie(await nextWorkspace(ctx.user.id, workspace.id));
  } catch (err) {
    return fail(err);
  }
  revalidatePath("/dashboard", "layout");
  redirect("/dashboard");
}

/** Leaves a workspace. The last owner cannot leave: hand it over or delete it. */
export async function leaveWorkspace(_prev: TeamState, _formData: FormData): Promise<TeamState> {
  try {
    const ctx = await context();
    const { workspace, user } = ctx;
    const blocked = await db.transaction(async (tx) => {
      if (workspace.role === "owner" && (await ownerCount(tx, workspace.id)) <= 1)
        return "You are the only owner. Make someone else an owner, or delete the workspace.";
      await tx
        .delete(members)
        .where(and(eq(members.orgId, workspace.id), eq(members.userId, user.id)));
      await revokeKeysOf(tx, workspace.id, user.id);
      return null;
    });
    if (blocked) return { error: blocked };
    await setWorkspaceCookie(await nextWorkspace(user.id, workspace.id));
  } catch (err) {
    return fail(err);
  }
  revalidatePath("/dashboard", "layout");
  redirect("/dashboard");
}

/**
 * Keys belong to the workspace, but someone who leaves still has copies of
 * the ones they created, so those stop working when they go.
 */
async function revokeKeysOf(tx: Pick<typeof db, "update">, orgId: string, userId: string) {
  await tx
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.orgId, orgId), eq(apiKeys.createdBy, userId), isNull(apiKeys.revokedAt)));
}

/* --------------------------------------------------------------------- members */

const inviteSchema = z.object({
  email: z
    .email("Enter a valid email address.")
    .max(320)
    .transform((e) => e.trim().toLowerCase()),
  role: z.enum(["member", "admin"]),
});

export async function inviteMember(_prev: TeamState, formData: FormData): Promise<TeamState> {
  try {
    const { workspace, user } = await context();
    if (!can.manageMembers(workspace.role))
      return { error: "Only owners and admins can invite people." };
    const parsed = inviteSchema.safeParse({
      email: String(formData.get("email") ?? "").trim(),
      role: formData.get("role"),
    });
    if (!parsed.success) return { error: parsed.error.issues[0]?.message };
    const { email, role } = parsed.data;

    const existing = await db
      .select({ id: members.id })
      .from(members)
      .innerJoin(users, eq(users.id, members.userId))
      .where(and(eq(members.orgId, workspace.id), eq(sql`lower(${users.email})`, email)))
      .limit(1);
    if (existing.length) return { error: `${email} is already a member.` };

    const now = new Date();
    const [pending] = await db
      .select({ n: count() })
      .from(invitations)
      .where(
        and(
          eq(invitations.orgId, workspace.id),
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt),
          gt(invitations.expiresAt, now),
        ),
      );
    if ((pending?.n ?? 0) >= MAX_PENDING_INVITES)
      return { error: `A workspace can have ${MAX_PENDING_INVITES} open invitations at once.` };

    const token = randomBytes(32).toString("base64url");
    await db.transaction(async (tx) => {
      // A fresh invitation replaces any still open for the same address.
      await tx
        .update(invitations)
        .set({ revokedAt: now })
        .where(
          and(
            eq(invitations.orgId, workspace.id),
            eq(invitations.email, email),
            isNull(invitations.acceptedAt),
            isNull(invitations.revokedAt),
          ),
        );
      await tx.insert(invitations).values({
        id: newId("inv"),
        orgId: workspace.id,
        email,
        role,
        tokenHash: hashInviteToken(token),
        invitedBy: user.id,
        expiresAt: new Date(now.getTime() + INVITE_DAYS * 86_400_000),
      });
    });

    const link = `${SITE.url}/invite/${token}`;
    const mailer = createMailer({
      RESEND_API_KEY: process.env.RESEND_API_KEY,
      EMAIL_FROM: process.env.EMAIL_FROM,
    });
    const sent = mailer.enabled
      ? await mailer.send({
          to: email,
          replyTo: user.email,
          subject: `${user.name || user.email} invited you to ${workspace.name} on ${SITE.name}`,
          text: [
            `${user.name || user.email} invited you to join the ${workspace.name} workspace on ${SITE.name} as ${roleLabel[role].toLowerCase()}.`,
            "",
            `Accept: ${link}`,
            "",
            `Sign in with the GitHub account whose verified email is ${email}. The link expires in ${INVITE_DAYS} days.`,
            "",
            "If you were not expecting this, you can ignore it.",
          ].join("\n"),
        })
      : { ok: false as const, error: "email is not configured" };

    revalidatePath("/dashboard/team");
    return sent.ok
      ? { ok: `Invitation sent to ${email}.`, link }
      : {
          ok: `Invitation created for ${email}. Email is not set up here, so share this link:`,
          link,
        };
  } catch (err) {
    return fail(err);
  }
}

export async function revokeInvitation(_prev: TeamState, formData: FormData): Promise<TeamState> {
  try {
    const { workspace } = await context();
    if (!can.manageMembers(workspace.role))
      return { error: "Only owners and admins can manage invitations." };
    await db
      .update(invitations)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(invitations.id, String(formData.get("id"))),
          eq(invitations.orgId, workspace.id),
          isNull(invitations.acceptedAt),
        ),
      );
    revalidatePath("/dashboard/team");
    return { ok: "Invitation revoked." };
  } catch (err) {
    return fail(err);
  }
}

const roleSchema = z.enum(["owner", "admin", "member"]);

export async function changeRole(_prev: TeamState, formData: FormData): Promise<TeamState> {
  try {
    const { workspace } = await context();
    if (!can.manageMembers(workspace.role))
      return { error: "Only owners and admins can change roles." };
    const next = roleSchema.safeParse(formData.get("role"));
    if (!next.success) return { error: "Pick a role." };
    const memberId = String(formData.get("id"));

    const error = await db.transaction(async (tx) => {
      const [target] = await tx
        .select({ id: members.id, userId: members.userId, role: members.role })
        .from(members)
        .where(and(eq(members.id, memberId), eq(members.orgId, workspace.id)))
        .limit(1);
      if (!target) return "That person is not in this workspace.";
      if (target.role === next.data) return null;
      if ((target.role === "owner" || next.data === "owner") && !can.assignOwner(workspace.role))
        return "Only an owner can make or change an owner.";
      if (target.role === "owner" && (await ownerCount(tx, workspace.id)) <= 1)
        return "A workspace needs at least one owner. Make someone else an owner first.";
      await tx.update(members).set({ role: next.data }).where(eq(members.id, target.id));
      return null;
    });
    if (error) return { error };
    revalidatePath("/dashboard", "layout");
    return { ok: `Role changed to ${roleLabel[next.data as Role].toLowerCase()}.` };
  } catch (err) {
    return fail(err);
  }
}

export async function removeMember(_prev: TeamState, formData: FormData): Promise<TeamState> {
  try {
    const { workspace, user } = await context();
    if (!can.manageMembers(workspace.role))
      return { error: "Only owners and admins can remove people." };
    const memberId = String(formData.get("id"));

    const error = await db.transaction(async (tx) => {
      const [target] = await tx
        .select({ id: members.id, userId: members.userId, role: members.role })
        .from(members)
        .where(and(eq(members.id, memberId), eq(members.orgId, workspace.id)))
        .limit(1);
      if (!target) return "That person is not in this workspace.";
      if (target.userId === user.id) return "To remove yourself, leave the workspace instead.";
      if (target.role === "owner" && !can.assignOwner(workspace.role))
        return "Only an owner can remove an owner.";
      await tx.delete(members).where(eq(members.id, target.id));
      await revokeKeysOf(tx, workspace.id, target.userId);
      return null;
    });
    if (error) return { error };
    revalidatePath("/dashboard/team");
    return { ok: "Removed. Keys they created have been revoked." };
  } catch (err) {
    return fail(err);
  }
}

/* ----------------------------------------------------------------- invitations */

/**
 * Accepts an invitation. Only the signed-in user whose verified email the
 * invitation names can use it, and the single conditional update makes a
 * second use of the same link a no-op rather than a second membership.
 */
export async function acceptInvitation(token: string): Promise<TeamState> {
  return accept(eq(invitations.tokenHash, hashInviteToken(token)));
}

/**
 * The same, from the onboarding page, where invitations to the signed-in
 * user's verified email are listed. The id alone is not a secret: the email
 * check below is what makes it theirs.
 */
export async function acceptInvitationById(id: string): Promise<TeamState> {
  return accept(eq(invitations.id, id));
}

async function accept(match: ReturnType<typeof eq>): Promise<TeamState> {
  let orgId: string;
  try {
    const user = await signedIn();
    const [invite] = await db.select().from(invitations).where(match).limit(1);
    if (!invite || invite.revokedAt) return { error: "This invitation is no longer valid." };
    if (invite.expiresAt < new Date()) return { error: "This invitation has expired." };
    if (!user.emailVerified || user.email.toLowerCase() !== invite.email)
      return {
        error: `This invitation is for ${invite.email}. Sign in with the GitHub account whose verified email that is.`,
      };
    orgId = invite.orgId;

    const already = (await listWorkspaces(user.id)).some((w) => w.id === invite.orgId);
    const error = await db.transaction(async (tx) => {
      const claimed = await tx
        .update(invitations)
        .set({ acceptedAt: new Date() })
        .where(and(eq(invitations.id, invite.id), isNull(invitations.acceptedAt)))
        .returning({ id: invitations.id });
      if (!claimed.length && !already) return "This invitation has already been used.";
      if (!already)
        await tx
          .insert(members)
          .values({ id: newId("mem"), orgId: invite.orgId, userId: user.id, role: invite.role })
          .onConflictDoNothing();
      return null;
    });
    if (error) return { error };
    await setWorkspaceCookie(orgId);
  } catch (err) {
    return fail(err);
  }
  revalidatePath("/dashboard", "layout");
  redirect("/dashboard");
}
