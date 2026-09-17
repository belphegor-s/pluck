import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { apiKeys, users } from "@pluck/db";
import { PluckError } from "@pluck/shared";
import { and, eq, isNull } from "drizzle-orm";
import { LRUCache } from "lru-cache";
import type { Services } from "./services.js";

export interface Caller {
  userId: string;
  apiKeyId: string | null;
}

export const OWNER_USER_ID = "usr_owner";

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const bytes = randomBytes(32);
  let body = "";
  for (const b of bytes) body += BASE62[b % 62];
  const key = `pk_live_${body}`;
  return { key, prefix: key.slice(0, 12), hash: hashKey(key) };
}

export const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

/**
 * Resolves API keys with a short in-process cache so the hot path costs no
 * database round trip. Revocations propagate within `ttl`.
 */
export class KeyAuthenticator {
  private readonly cache = new LRUCache<string, Caller | false>({ max: 50_000, ttl: 30_000 });
  private readonly touched = new LRUCache<string, true>({ max: 50_000, ttl: 5 * 60_000 });
  private readonly bootstrapHash: Buffer | null;

  constructor(private readonly s: Services) {
    this.bootstrapHash = s.config.BOOTSTRAP_API_KEY ? createHash("sha256").update(s.config.BOOTSTRAP_API_KEY).digest() : null;
  }

  /** Creates the owner account used by BOOTSTRAP_API_KEY on self-hosted instances. */
  async ensureOwner(): Promise<void> {
    if (!this.bootstrapHash) return;
    await this.s.db
      .insert(users)
      .values({ id: OWNER_USER_ID, name: "Owner", email: "owner@localhost", emailVerified: true, role: "admin" })
      .onConflictDoNothing();
  }

  async authenticate(header: string | undefined): Promise<Caller> {
    const key = header?.replace(/^Bearer\s+/i, "").trim();
    if (!key) throw new PluckError("invalid_api_key", "Missing API key. Send `Authorization: Bearer pk_live_...`.");

    if (this.bootstrapHash) {
      const candidate = createHash("sha256").update(key).digest();
      if (timingSafeEqual(candidate, this.bootstrapHash)) return { userId: OWNER_USER_ID, apiKeyId: null };
    }

    if (!key.startsWith("pk_") || key.length > 128) throw new PluckError("invalid_api_key", "Invalid API key.");
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
