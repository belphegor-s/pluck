#!/usr/bin/env node
/**
 * Creates the admin panel's password hash (scrypt, the format lib/admin/auth.ts
 * reads) and, with --write, stores it in .env:
 *
 *   node scripts/admin-password.mjs                 # generate a strong password
 *   node scripts/admin-password.mjs --write         # ...and save it to .env
 *   ADMIN_PASSWORD='your own' node scripts/admin-password.mjs --write
 *
 * The password is printed once and never stored; only the hash is. Push it to
 * the server with `node scripts/coolify.mjs env` and redeploy web.
 */
import { randomBytes, scryptSync } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const N = 2 ** 15;
const r = 8;
const p = 1;

const password = process.env.ADMIN_PASSWORD || randomBytes(18).toString("base64url");
if (password.length < 12) {
  console.error("Use at least 12 characters.");
  process.exit(1);
}
const salt = randomBytes(16);
const hash = scryptSync(password, salt, 32, { N, r, p, maxmem: 128 * 1024 * 1024 });
const value = `scrypt:${N}:${r}:${p}:${salt.toString("base64")}:${hash.toString("base64")}`;

if (process.argv.includes("--write")) {
  const file = join(dirname(fileURLToPath(import.meta.url)), "..", ".env");
  let env = existsSync(file) ? readFileSync(file, "utf8") : "";
  const set = (key, v) => {
    const line = `${key}=${v}`;
    env = new RegExp(`^${key}=.*$`, "m").test(env)
      ? env.replace(new RegExp(`^${key}=.*$`, "m"), line)
      : `${env.replace(/\n?$/, "\n")}${line}\n`;
  };
  set("ADMIN_PASSWORD_HASH", value);
  if (!/^ADMIN_USERNAME=.+$/m.test(env)) set("ADMIN_USERNAME", "admin");
  writeFileSync(file, env);
  console.log("Saved ADMIN_PASSWORD_HASH to .env.");
} else {
  console.log(`ADMIN_PASSWORD_HASH=${value}`);
}
if (!process.env.ADMIN_PASSWORD)
  console.log(`\nPassword (shown once, store it in your password manager):\n${password}`);
