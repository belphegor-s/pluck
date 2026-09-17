import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb } from "./index.js";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");

const db = createDb(url, { max: 1 });
// Several API replicas may boot at once; serialise migrations with an advisory lock.
await db.$client`SELECT pg_advisory_lock(727274)`;
try {
  await db.$client`CREATE EXTENSION IF NOT EXISTS pgcrypto`;
  await migrate(db, {
    migrationsFolder: join(dirname(fileURLToPath(import.meta.url)), "../drizzle"),
  });
} finally {
  await db.$client`SELECT pg_advisory_unlock(727274)`;
  await db.$client.end();
}
console.log("migrations applied");
