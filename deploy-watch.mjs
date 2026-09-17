// Emits one line per deployment state change; exits when all four reach a terminal state.
import { readFileSync } from "node:fs";
const env = {};
for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) { const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim()); if (m) env[m[1]] = m[2]; }
const BASE = env.COOLIFY_API_URL.replace(/\/$/, "");
const h = { authorization: `Bearer ${env.COOLIFY_API_TOKEN}`, accept: "application/json", "CF-Access-Client-Id": env.CF_ACCESS_CLIENT_ID, "CF-Access-Client-Secret": env.CF_ACCESS_CLIENT_SECRET };
const seen = new Map();
const TERMINAL = new Set(["finished", "failed", "cancelled-by-user"]);
const names = ["pluck-api", "pluck-worker", "pluck-mcp", "pluck-web"];
for (;;) {
  let list = [];
  try { list = await (await fetch(`${BASE}/api/v1/deployments`, { headers: h })).json(); } catch { await new Promise(r => setTimeout(r, 15000)); continue; }
  const mine = (Array.isArray(list) ? list : []).filter((d) => names.includes(d.application_name));
  for (const d of mine) {
    const key = d.deployment_uuid;
    if (seen.get(key) !== d.status) { seen.set(key, d.status); console.log(`${d.application_name} ${d.status}`); }
  }
  const byApp = new Map();
  for (const d of mine) if (!byApp.has(d.application_name)) byApp.set(d.application_name, d.status);
  if (names.every((n) => TERMINAL.has(byApp.get(n)))) { console.log("ALL DEPLOYMENTS DONE"); break; }
  await new Promise(r => setTimeout(r, 20000));
}
