import { readFileSync } from "node:fs";
const env = {};
for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) { const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim()); if (m) env[m[1]] = m[2]; }
const BASE = env.COOLIFY_API_URL.replace(/\/$/, "");
const h = { authorization: `Bearer ${env.COOLIFY_API_TOKEN}`, accept: "application/json", "CF-Access-Client-Id": env.CF_ACCESS_CLIENT_ID, "CF-Access-Client-Secret": env.CF_ACCESS_CLIENT_SECRET };
const svcs = await (await fetch(`${BASE}/api/v1/services`, { headers: h })).json();
const s = svcs.find((x) => x.name === "pluck-searxng");
console.log("service status:", s?.status ?? "?", s?.uuid ?? "");
