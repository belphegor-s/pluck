/**
 * Workspace roles and what each may do. Pure so it can be tested, and shared
 * so the dashboard and anything else that checks a role agree on the rules.
 */
export type Role = "owner" | "admin" | "member";

export const ROLES: readonly Role[] = ["owner", "admin", "member"];

const RANK: Record<Role, number> = { member: 1, admin: 2, owner: 3 };

/** Members use the product; admins run the workspace; owners can also delete it and make owners. */
export const can = {
  manageMembers: (r: Role) => RANK[r] >= RANK.admin,
  manageBilling: (r: Role) => RANK[r] >= RANK.admin,
  manageSettings: (r: Role) => RANK[r] >= RANK.admin,
  /** Model provider keys, proxies and the webhook signing secret. */
  manageCredentials: (r: Role) => RANK[r] >= RANK.admin,
  revokeAnyKey: (r: Role) => RANK[r] >= RANK.admin,
  deleteWorkspace: (r: Role) => r === "owner",
  /** Only an owner can make or unmake an owner. */
  assignOwner: (r: Role) => r === "owner",
};

export const roleLabel: Record<Role, string> = { owner: "Owner", admin: "Admin", member: "Member" };

/**
 * A redirect target from a query string, only if it stays on this site.
 * `//evil.example` and `/\evil.example` start with a slash too, and browsers
 * treat both as another host, so a leading slash alone is not enough.
 */
export function safeRedirect(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next?.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
