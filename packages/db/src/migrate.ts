import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb } from "./index.js";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");

const db = createDb(url, { max: 1 });
await db.$client`CREATE EXTENSION IF NOT EXISTS pgcrypto`;
await migrate(db, { migrationsFolder: join(dirname(fileURLToPath(import.meta.url)), "../drizzle") });
await db.$client.end();
console.log("migrations applied");
