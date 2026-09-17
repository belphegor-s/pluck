import { randomBytes } from "node:crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export * from "./schema.js";
export { schema };

export type Database = ReturnType<typeof createDb>;

export function createDb(url: string, { max = 10 }: { max?: number } = {}) {
  const client = postgres(url, {
    max,
    idle_timeout: 30,
    connect_timeout: 10,
    prepare: true,
    onnotice: () => {},
  });
  return Object.assign(drizzle(client, { schema, casing: "snake_case" }), { $client: client });
}

const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";

/**
 * Sortable, prefixed ids: `crw_01j9...`. 10 chars of millisecond time plus
 * 16 chars (80 bits) of randomness, Crockford base32.
 */
export function newId(prefix: string): string {
  let time = Date.now();
  let head = "";
  for (let i = 0; i < 10; i++) {
    head = ALPHABET[time % 32] + head;
    time = Math.floor(time / 32);
  }
  const bytes = randomBytes(10);
  let tail = "";
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      tail += ALPHABET[(buffer >> bits) & 31];
    }
  }
  return `${prefix}_${head}${tail}`;
}
