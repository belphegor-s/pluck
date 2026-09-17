import { createHash, randomBytes } from "node:crypto";
import { BRAND } from "@pluck/shared";

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

export const hashApiKey = (key: string) => createHash("sha256").update(key).digest("hex");

/** `pk_live_…`: 190 bits of entropy. Only the hash is ever stored. */
export function generateApiKey(): { key: string; prefix: string; hash: string } {
  let body = "";
  for (const b of randomBytes(32)) body += BASE62[b % 62];
  const key = `${BRAND.apiKeyLive}${body}`;
  return { key, prefix: key.slice(0, 12), hash: hashApiKey(key) };
}
