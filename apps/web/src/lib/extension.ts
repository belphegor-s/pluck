import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { apiKeys, members, newId, organizations, users, verifications } from "@pluck/db";
import { generateApiKey, hashApiKey } from "@pluck/runtime";
import {
  BRAND,
  DEV_EXTENSION,
  type ExtensionTokenResponse,
  extensionId,
  extensionKeyName,
} from "@pluck/shared";
import { and, eq, isNull, like, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { SITE } from "@/lib/site";

/** Active keys one workspace may hold; the dashboard enforces the same number. */
export const MAX_WORKSPACE_KEYS = 25;

/** A code is only useful for the seconds between approval and the exchange. */
const CODE_TTL_MS = 2 * 60 * 1000;

/** `verification.identifier` prefix for extension codes; the rest is the code's hash. */
const CODE_PREFIX = "extension-code:";

/**
 * Extensions allowed to sign in.
 *
 * Any extension can declare this site in `externally_connectable` and open the
 * connect page with its own id, so the page must refuse ids it does not know:
 * otherwise a look-alike could walk someone through approval and receive a
 * key. The store id comes from the product identity, extra ids (an Edge
 * listing, a self-hoster's own build) from CHROME_EXTENSION_IDS, and the
 * pinned development id is accepted outside production only.
 */
export function allowedExtensionIds(): Set<string> {
  const ids = new Set<string>();
  const add = (value: string | undefined) => {
    for (const id of (value ?? "").split(/[\s,]+/))
      if (extensionId.safeParse(id).success) ids.add(id);
  };
  add(BRAND.chromeExtensionId);
  add(process.env.CHROME_EXTENSION_IDS);
  if (process.env.NODE_ENV !== "production") ids.add(DEV_EXTENSION.id);
  return ids;
}

export const isAllowedExtension = (id: string) => allowedExtensionIds().has(id);

/** The calling extension's id, when the request comes from one we allow. */
export function extensionFromOrigin(request: Request): string | null {
  const id = /^chrome-extension:\/\/([a-p]{32})$/.exec(request.headers.get("origin") ?? "")?.[1];
  return id && isAllowedExtension(id) ? id : null;
}

/**
 * CORS for the routes the extension calls. The extension holds no host
 * permissions, so its requests are ordinary cross-origin ones and only an
 * allowed extension origin is ever echoed back.
 */
export function extensionCors(request: Request): Record<string, string> {
  const id = extensionFromOrigin(request);
  if (!id) return { vary: "origin" };
  return {
    "access-control-allow-origin": `chrome-extension://${id}`,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-max-age": "86400",
    vary: "origin",
  };
}

const sha256 = (value: string) => createHash("sha256").update(value).digest();

interface Grant {
  userId: string;
  orgId: string;
  ext: string;
  challenge: string;
  device?: string;
}

/**
 * Records the user's approval and returns the one-time code for it.
 *
 * Only the code's hash is stored, in the same table better-auth uses for its
 * own short-lived tokens, so no migration is needed and a database read never
 * yields a usable code.
 */
export async function issueExtensionCode(grant: Grant): Promise<string> {
  const code = randomBytes(32).toString("base64url");
  await db
    .delete(verifications)
    .where(
      and(
        like(verifications.identifier, `${CODE_PREFIX}%`),
        lt(verifications.expiresAt, new Date()),
      ),
    );
  await db.insert(verifications).values({
    id: newId("ver"),
    identifier: CODE_PREFIX + sha256(code).toString("hex"),
    value: JSON.stringify(grant),
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  });
  return code;
}

export class ExtensionAuthError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "ExtensionAuthError";
  }
}

/** How many keys in a workspace still work. */
export async function activeKeyCount(orgId: string): Promise<number> {
  return db.$count(apiKeys, and(eq(apiKeys.orgId, orgId), isNull(apiKeys.revokedAt)));
}

/**
 * Swaps a code and its PKCE verifier for a new workspace API key.
 *
 * The code is deleted as it is read, so it works once even under a race, and
 * it is useless without the verifier that never left the extension. Membership
 * is checked again here: approval and exchange are separate requests.
 */
export async function redeemExtensionCode(
  code: string,
  verifier: string,
  callerExt: string,
): Promise<ExtensionTokenResponse> {
  const [row] = await db
    .delete(verifications)
    .where(eq(verifications.identifier, CODE_PREFIX + sha256(code).toString("hex")))
    .returning({ value: verifications.value, expiresAt: verifications.expiresAt });
  const invalid = new ExtensionAuthError(
    "This sign-in has expired. Start again from the extension.",
  );
  if (!row || row.expiresAt < new Date()) throw invalid;

  let grant: Grant;
  try {
    grant = JSON.parse(row.value) as Grant;
  } catch {
    throw invalid;
  }
  const expected = Buffer.from(grant.challenge, "base64url");
  const actual = sha256(verifier);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw invalid;
  if (grant.ext !== callerExt) throw invalid;

  const [member] = await db
    .select({
      orgName: organizations.name,
      userName: users.name,
      email: users.email,
    })
    .from(members)
    .innerJoin(organizations, eq(organizations.id, members.orgId))
    .innerJoin(users, eq(users.id, members.userId))
    .where(and(eq(members.orgId, grant.orgId), eq(members.userId, grant.userId)))
    .limit(1);
  if (!member) throw new ExtensionAuthError("You are no longer a member of that workspace.", 403);

  const name = extensionKeyName(grant.device);
  const { key, prefix, hash } = generateApiKey();
  await db.transaction(async (tx) => {
    // Signing in again from the same browser replaces its old key instead of
    // leaving a working one behind that nobody holds any more.
    await tx
      .update(apiKeys)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(apiKeys.orgId, grant.orgId),
          eq(apiKeys.createdBy, grant.userId),
          eq(apiKeys.name, name),
          isNull(apiKeys.revokedAt),
        ),
      );
    const active = await tx.$count(
      apiKeys,
      and(eq(apiKeys.orgId, grant.orgId), isNull(apiKeys.revokedAt)),
    );
    if (active >= MAX_WORKSPACE_KEYS)
      throw new ExtensionAuthError(
        `This workspace has reached the limit of ${MAX_WORKSPACE_KEYS} keys. Revoke one in the dashboard, then connect again.`,
        409,
      );
    await tx.insert(apiKeys).values({
      id: newId("key"),
      orgId: grant.orgId,
      createdBy: grant.userId,
      name,
      prefix,
      hash,
    });
  });

  return {
    apiKey: key,
    apiUrl: SITE.apiUrl,
    workspace: { id: grant.orgId, name: member.orgName },
    user: { name: member.userName, email: member.email },
  };
}

/**
 * Revokes the key the extension is holding, when it signs out. Possession of
 * the key is the authorisation; an unknown key is not an error worth telling
 * apart from a revoked one.
 */
export async function revokeExtensionKey(key: string): Promise<boolean> {
  if (!key.startsWith(BRAND.apiKeyFamily) || key.length > 128) return false;
  const revoked = await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(apiKeys.hash, hashApiKey(key)),
        isNull(apiKeys.revokedAt),
        like(apiKeys.name, `${extensionKeyName()}%`),
      ),
    )
    .returning({ id: apiKeys.id });
  return revoked.length > 0;
}

/** Fixed-window limiter for the public extension routes, per client address. */
export function limiter(perWindow: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return (request: Request): boolean => {
    const ip =
      request.headers.get("cf-connecting-ip") ??
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "anon";
    const now = Date.now();
    const recent = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
    recent.push(now);
    hits.set(ip, recent);
    if (hits.size > 10_000) hits.clear();
    return recent.length <= perWindow;
  };
}
