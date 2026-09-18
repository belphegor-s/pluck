#!/usr/bin/env node
/**
 * Create and inspect the Polar products that back credit packs.
 *
 *   node scripts/polar.mjs whoami [--env sandbox|production]
 *   node scripts/polar.mjs sync             # create any missing pack products
 *   node scripts/polar.mjs webhooks         # list webhook endpoints
 *   node scripts/polar.mjs webhooks --create https://pluck-api.procd.cc/webhooks/polar
 *
 * Packs come from `creditPacks` in @pluck/shared, so prices live in one place.
 * Products are matched by `metadata.pack`, which makes sync idempotent: run it
 * again after adding a pack and only the new one is created.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_PATH = join(ROOT, ".env");

const creditPacks = [
  { id: "starter", credits: 10_000, priceUsd: 10 },
  { id: "builder", credits: 55_000, priceUsd: 50, bonus: "10% bonus" },
  { id: "scale", credits: 240_000, priceUsd: 200, bonus: "20% bonus" },
  { id: "hyper", credits: 1_300_000, priceUsd: 1_000, bonus: "30% bonus" },
];

function readEnv() {
  const out = {};
  for (const line of readFileSync(ENV_PATH, "utf8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2];
  }
  return out;
}

const env = readEnv();
const argv = process.argv.slice(2);
const command = argv[0] ?? "whoami";
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? undefined : (argv[i + 1] ?? true);
};

const target = flag("env") ?? env.POLAR_SERVER ?? "sandbox";
const sandbox = target !== "production";
const token = sandbox ? env.POLAR_ACCESS_TOKEN : (env.POLAR_ACCESS_TOKEN_PROD ?? env.POLAR_ACCESS_TOKEN);
const api = sandbox ? "https://sandbox-api.polar.sh" : "https://api.polar.sh";

if (!token) {
  console.error(`No access token for ${target}. Set POLAR_ACCESS_TOKEN / POLAR_ACCESS_TOKEN_PROD.`);
  process.exit(1);
}

async function call(path, init = {}) {
  const res = await fetch(`${api}/v1${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...init.headers,
    },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(`${init.method ?? "GET"} ${path} → ${res.status} ${text.slice(0, 400)}`);
  }
  return body;
}

const label = (pack) =>
  `${pack.credits.toLocaleString("en-US")} credits${pack.bonus ? ` (${pack.bonus})` : ""}`;

async function organization() {
  const orgs = await call("/organizations/?limit=10");
  const org = orgs.items?.[0];
  if (!org) throw new Error("This token can see no organization.");
  return org;
}

async function products(orgId) {
  const list = await call(`/products/?organization_id=${orgId}&limit=100&is_archived=false`);
  return list.items ?? [];
}

async function whoami() {
  const org = await organization();
  console.log(`${target}: ${org.name} (${org.slug}) ${org.id}`);
  for (const p of await products(org.id)) {
    const price = p.prices?.[0]?.priceAmount ?? p.prices?.[0]?.price_amount;
    console.log(`  ${p.metadata?.pack ?? "-"}  ${p.name}  $${(price ?? 0) / 100}  ${p.id}`);
  }
}

async function sync() {
  const org = await organization();
  const existing = await products(org.id);
  const ids = {};

  for (const pack of creditPacks) {
    const found = existing.find((p) => p.metadata?.pack === pack.id);
    if (found) {
      ids[pack.id] = found.id;
      console.log(`= ${pack.id.padEnd(8)} ${found.id}`);
      continue;
    }
    const created = await call("/products/", {
      method: "POST",
      body: JSON.stringify({
        // The organization also sells other products, so the name carries the brand.
        name: `Pluck ${pack.credits.toLocaleString("en-US")} credits`,
        description: `${label(pack)} for the Pluck API. Credits never expire and are spent per request.`,
        recurring_interval: null,
        prices: [
          { amount_type: "fixed", price_amount: pack.priceUsd * 100, price_currency: "usd" },
        ],
        metadata: { pack: pack.id, credits: String(pack.credits) },
      }),
    });
    ids[pack.id] = created.id;
    console.log(`+ ${pack.id.padEnd(8)} ${created.id}`);
  }

  const suffix = sandbox ? "" : "_PROD";
  const lines = creditPacks.map((p) => `POLAR_PRODUCT_${p.id.toUpperCase()}${suffix}=${ids[p.id]}`);
  writeEnv(lines);
  console.log(`\n${lines.join("\n")}`);
}

/** Adds or updates keys in .env in place, keeping comments and order. */
function writeEnv(lines) {
  let text = readFileSync(ENV_PATH, "utf8");
  for (const line of lines) {
    const key = line.split("=")[0];
    const re = new RegExp(`^${key}=.*$`, "m");
    text = re.test(text) ? text.replace(re, line) : `${text.replace(/\s*$/, "")}\n${line}\n`;
  }
  writeFileSync(ENV_PATH, text);
}

async function webhooks() {
  const org = await organization();
  const create = flag("create");
  if (typeof create === "string") {
    const secret = sandbox ? env.POLAR_WEBHOOK_SECRET : env.POLAR_WEBHOOK_SECRET_PROD;
    if (!secret) throw new Error("Set the matching POLAR_WEBHOOK_SECRET first.");
    const made = await call("/webhooks/endpoints", {
      method: "POST",
      body: JSON.stringify({
        organization_id: org.id,
        url: create,
        format: "raw",
        secret,
        events: ["order.paid", "order.refunded"],
      }),
    });
    console.log(`+ ${made.url} ${made.id}`);
    return;
  }
  const list = await call(`/webhooks/endpoints?organization_id=${org.id}&limit=50`);
  for (const w of list.items ?? []) console.log(`  ${w.url}  ${(w.events ?? []).join(",")}  ${w.id}`);
  if (!list.items?.length) console.log("  (none)");
}

const commands = { whoami, sync, webhooks };
const run = commands[command];
if (!run) {
  console.error(`Unknown command "${command}". Use: ${Object.keys(commands).join(", ")}`);
  process.exit(1);
}
await run().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
