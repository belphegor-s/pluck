#!/usr/bin/env node
/**
 * Writes the endpoint list the Python SDK's tests check it against.
 *
 *   pnpm --filter @pluck/shared build && node scripts/sdk-ops.mjs
 *
 * Run after adding or moving an endpoint, then cover it in packages/sdk-python.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { endpoints } from "../packages/shared/dist/index.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ops = Object.entries(endpoints)
  .map(([id, e]) => ({ id, method: e.method.toUpperCase(), path: e.path }))
  .sort((a, b) => a.id.localeCompare(b.id));
writeFileSync(
  join(ROOT, "packages/sdk-python/tests/operations.json"),
  `${JSON.stringify(ops, null, 2)}\n`,
);
console.log(`${ops.length} operations`);
