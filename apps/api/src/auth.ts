import { createHash, timingSafeEqual } from "node:crypto";
import { apiKeys, users } from "@pluck/db";
import { hashApiKey } from "@pluck/runtime";
import { BRAND, PluckError } from "@pluck/shared";
import { and, eq, isNull } from "drizzle-orm";
import { LRUCache } from "lru-cache";
import type { Services } from "./services.js";

export interface Caller {
  userId: string;
  apiKeyId: string | null;
}

export const OWNER_USER_ID = "usr_owner";

const hashKey = hashApiKey;

/**
 * Resolves API keys with a short in-process cache so the hot path costs no
 * database round trip. Revocations propagate within `ttl`.
 */
export class KeyAuthenticator {
  private readonly cache = new LRUCache<string, Caller | false>({ max: 50_000, ttl: 30_000 });
  private readonly touched = new LRUCache<string, true>({ max: 50_000, ttl: 5 * 60_000 });
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
  }

  /**
   * Trusted internal call from the dashboard playground: the web app has
   * already authenticated the session, so usage bills to that user.
   */
  internal(secret: string | undefined, userId: string | undefined): Caller | null {
    const expected = this.s.config.INTERNAL_API_SECRET;
    if (!expected || !secret || !userId) return null;
    const a = Buffer.from(createHash("sha256").update(secret).digest());
    const b = Buffer.from(createHash("sha256").update(expected).digest());
    return timingSafeEqual(a, b) ? { userId, apiKeyId: null } : null;
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
        return { userId: OWNER_USER_ID, apiKeyId: null };
    }

    if (!key.startsWith(BRAND.apiKeyFamily) || key.length > 128)
      throw new PluckError("invalid_api_key", "Invalid API key.");
    const hash = hashKey(key);
    let caller = this.cache.get(hash);
    if (caller === undefined) {
      const [row] = await this.s.db
        .select({ id: apiKeys.id, userId: apiKeys.userId })
        .from(apiKeys)
        .where(and(eq(apiKeys.hash, hash), isNull(apiKeys.revokedAt)))
        .limit(1);
      caller = row ? { userId: row.userId, apiKeyId: row.id } : false;
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
