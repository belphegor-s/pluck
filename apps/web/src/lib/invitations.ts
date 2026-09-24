import "server-only";
import { createHash } from "node:crypto";
import { invitations, organizations } from "@pluck/db";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/lib/db";

/** Invitation tokens are stored only as this hash. */
export const hashInviteToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** What an invitation offers, for the page shown before accepting it. */
export async function describeInvitation(token: string) {
  const [row] = await db
    .select({
      email: invitations.email,
      role: invitations.role,
      expiresAt: invitations.expiresAt,
      acceptedAt: invitations.acceptedAt,
      revokedAt: invitations.revokedAt,
      orgName: organizations.name,
    })
    .from(invitations)
    .innerJoin(organizations, eq(organizations.id, invitations.orgId))
    .where(eq(invitations.tokenHash, hashInviteToken(token)))
    .limit(1);
  return row ?? null;
}

/** Open invitations to one address, for the onboarding page. */
export async function openInvitationsFor(email: string) {
  return db
    .select({
      id: invitations.id,
      role: invitations.role,
      orgName: organizations.name,
      expiresAt: invitations.expiresAt,
    })
    .from(invitations)
    .innerJoin(organizations, eq(organizations.id, invitations.orgId))
    .where(
      and(
        eq(invitations.email, email.toLowerCase()),
        isNull(invitations.acceptedAt),
        isNull(invitations.revokedAt),
        gt(invitations.expiresAt, new Date()),
      ),
    );
}
