import "server-only";
import { createHash } from "node:crypto";
import { invitations, organizations } from "@pluck/db";
import { eq } from "drizzle-orm";
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
