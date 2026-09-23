import { createHash, timingSafeEqual } from "node:crypto";
import { apiKeys, members, organizations, users } from "@pluck/db";
import { hashApiKey } from "@pluck/runtime";
import { BRAND, OWNER_USER_ID, PluckError } from "@pluck/shared";
import { and, eq, isNull } from "drizzle-orm";
import { LRUCache } from "lru-cache";
import type { Services } from "./services.js";

export interface Caller {
  /** The workspace that owns and pays for the call. */
  orgId: string;
  /** The member acting, when known: the dashboard user, or who created the key. */
  userId: string | null;
  apiKeyId: string | null;
}

/** One-time credit grant for the instance owner, applied idempotently. */
const OWNER_GRANT = 250_000;

const hashKey = hashApiKey;

/**
 * Resolves API keys with a short in-process cache so the hot path costs no
 * database round trip. Revocations propagate within `ttl`.
 */
export class KeyAuthenticator {
  private readonly cache = new LRUCache<string, Caller | false>({ max: 50_000, ttl: 30_000 });
  private readonly touched = new LRUCache<string, true>({ max: 50_000, ttl: 5 * 60_000 });
  /** "user:org" -> is a member. Short, so a removed member loses access quickly. */
  private readonly membership = new LRUCache<string, boolean>({ max: 50_000, ttl: 15_000 });
  private readonly bootstrapHash: Buffer | null;

  constructor(private readonly s: Services) {
    this.bootstrapHash = s.config.BOOTSTRAP_API_KEY
      ? createHash("sha256").update(s.config.BOOTSTRAP_API_KEY).digest()
      : null;
  }

  /** Creates the owner account used by BOOTSTRAP_API_KEY on self-hosted instances. */
  async ensureOwner(): Promise<void> {
    if (!this.bootstrapHash) return;
    await this.s.db
      .insert(users)
      .values({
        id: OWNER_USER_ID,
        name: "Owner",
        email: "owner@localhost",
        emailVerified: true,
        role: "admin",
      })
      .onConflictDoNothing();
    await this.s.db
      .insert(organizations)
      .values({ id: OWNER_USER_ID, name: "Personal", slug: OWNER_USER_ID, personal: true })
      .onConflictDoNothing();
    await this.s.db
      .insert(members)
      .values({
        id: `mem_${OWNER_USER_ID}`,
        orgId: OWNER_USER_ID,
        userId: OWNER_USER_ID,
        role: "owner",
      })
      .onConflictDoNothing();
    // The operator's own key should work on a metered instance too.
    if (this.s.credits.enabled) {
      await this.s.credits.grant(OWNER_USER_ID, OWNER_GRANT, "adjustment", "bootstrap:owner");
    }
  }

  /**
   * Trusted internal call from the dashboard: the web app has authenticated
   * the session and names the workspace. Membership is checked here as well,
   * so a bug in the web app cannot act on a workspace the user is not in.
   * Without a workspace the user's personal one is used.
   */
  async internal(
    secret: string | undefined,
    userId: string | undefined,
    orgId: string | undefined,
  ): Promise<Caller | null> {
    const expected = this.s.config.INTERNAL_API_SECRET;
    if (!expected || !secret || !userId) return null;
    const a = Buffer.from(createHash("sha256").update(secret).digest());
    const b = Buffer.from(createHash("sha256").update(expected).digest());
    if (!timingSafeEqual(a, b)) return null;
    const org = orgId || userId;
    if (!(await this.isMember(userId, org)))
      throw new PluckError("forbidden", "You are not a member of this workspace.");
    return { orgId: org, userId, apiKeyId: null };
  }

  private async isMember(userId: string, orgId: string): Promise<boolean> {
    const key = `${userId}:${orgId}`;
    const cached = this.membership.get(key);
    if (cached !== undefined) return cached;
    const [row] = await this.s.db
      .select({ id: members.id })
      .from(members)
      .where(and(eq(members.userId, userId), eq(members.orgId, orgId)))
      .limit(1);
    this.membership.set(key, Boolean(row));
    return Boolean(row);
  }

  async authenticate(header: string | undefined): Promise<Caller> {
    const key = header?.replace(/^Bearer\s+/i, "").trim();
    if (!key)
      throw new PluckError(
        "invalid_api_key",
        `Missing API key. Send \`Authorization: Bearer ${BRAND.apiKeyLive}...\`.`,
      );

    if (this.bootstrapHash) {
      const candidate = createHash("sha256").update(key).digest();
      if (timingSafeEqual(candidate, this.bootstrapHash))
        return { orgId: OWNER_USER_ID, userId: OWNER_USER_ID, apiKeyId: null };
    }

    if (!key.startsWith(BRAND.apiKeyFamily) || key.length > 128)
      throw new PluckError("invalid_api_key", "Invalid API key.");
    const hash = hashKey(key);
    let caller = this.cache.get(hash);
    if (caller === undefined) {
      const [row] = await this.s.db
        .select({ id: apiKeys.id, orgId: apiKeys.orgId, createdBy: apiKeys.createdBy })
        .from(apiKeys)
        .where(and(eq(apiKeys.hash, hash), isNull(apiKeys.revokedAt)))
        .limit(1);
      caller = row ? { orgId: row.orgId, userId: row.createdBy, apiKeyId: row.id } : false;
      this.cache.set(hash, caller);
    }
    if (!caller) throw new PluckError("invalid_api_key", "Invalid or revoked API key.");

    if (caller.apiKeyId && !this.touched.has(caller.apiKeyId)) {
      this.touched.set(caller.apiKeyId, true);
      void this.s.db
        .update(apiKeys)
        .set({ lastUsedAt: new Date() })
        .where(eq(apiKeys.id, caller.apiKeyId))
        .catch(() => {});
    }
    return caller;
  }
}
