// Exits once no pluck deployment is active, then triggers a fresh deploy of all four.
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const env = {};
for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) { const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim()); if (m) env[m[1]] = m[2]; }
const BASE = env.COOLIFY_API_URL.replace(/\/$/, "");
const h = { authorization: `Bearer ${env.COOLIFY_API_TOKEN}`, accept: "application/json", "CF-Access-Client-Id": env.CF_ACCESS_CLIENT_ID, "CF-Access-Client-Secret": env.CF_ACCESS_CLIENT_SECRET };
for (let i = 0; i < 120; i++) {
  await new Promise((r) => setTimeout(r, 15000));
  let active = [];
  try { active = await (await fetch(`${BASE}/api/v1/deployments`, { headers: h })).json(); } catch { continue; }
  const mine = (Array.isArray(active) ? active : []).filter((d) => String(d.application_name).startsWith("pluck-"));
  if (mine.length === 0) {
    console.log("build queue idle; redeploying with the new Dockerfile");
    console.log(execFileSync("node", ["scripts/coolify.mjs", "deploy"], { encoding: "utf8" }).trim());
    process.exit(0);
  }
}
console.log("still busy after 30 minutes");
