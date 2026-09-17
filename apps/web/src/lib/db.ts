import "server-only";
import { createDb } from "@pluck/db";

const globalForDb = globalThis as unknown as { pluckDb?: ReturnType<typeof createDb> };

/** One pool per process; Next re-imports modules on every hot reload in dev. */
if (!globalForDb.pluckDb) {
  globalForDb.pluckDb = createDb(process.env.DATABASE_URL ?? "", { max: 5 });
}

export const db = globalForDb.pluckDb;
