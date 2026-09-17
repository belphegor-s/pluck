#!/usr/bin/env node
/** Prints each pluck app status change; exits once all four settle. */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = {};
for (const line of readFileSync(join(ROOT, ".env"), "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m) env[m[1]] = m[2];
}
const BASE = env.COOLIFY_API_URL.replace(/\/$/, "");
const h = {
  authorization: `Bearer ${env.COOLIFY_API_TOKEN}`,
  accept: "application/json",
  "CF-Access-Client-Id": env.CF_ACCESS_CLIENT_ID,
  "CF-Access-Client-Secret": env.CF_ACCESS_CLIENT_SECRET,
};
const NAMES = ["pluck-api", "pluck-worker", "pluck-mcp", "pluck-web"];
const seen = new Map();
/** Deployments are queued asynchronously, so require a few quiet polls before declaring the end. */
const QUIET_POLLS = 4;
let quiet = 0;

for (let i = 0; i < 120; i++) {
  let apps = [];
  let active = [];
  try {
    apps = await (await fetch(`${BASE}/api/v1/applications`, { headers: h })).json();
    active = await (await fetch(`${BASE}/api/v1/deployments`, { headers: h })).json();
  } catch {
    await new Promise((r) => setTimeout(r, 15_000));
    continue;
  }
  const mine = apps.filter((a) => NAMES.includes(a.name));
  for (const a of mine) {
    if (seen.get(a.name) !== a.status) {
      seen.set(a.name, a.status);
      console.log(`${a.name} ${a.status}`);
    }
  }
  const building = (Array.isArray(active) ? active : []).filter((d) =>
    NAMES.includes(d.application_name),
  );
  const settled = mine.every((a) => /running:healthy|exited/.test(a.status));
  quiet = building.length === 0 && settled ? quiet + 1 : 0;
  if (quiet >= QUIET_POLLS) {
    const healthy = mine.filter((a) => a.status === "running:healthy").length;
    console.log(`SETTLED ${healthy}/${NAMES.length} healthy`);
    break;
  }
  await new Promise((r) => setTimeout(r, 15_000));
}
