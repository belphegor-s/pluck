#!/usr/bin/env node
/**
 * Deploys SearXNG next to Pluck as the search backend, and points the API and
 * worker at it. Keyless engines block datacentre IPs, so a self-hosted
 * metasearch instance is the reliable no-API-key option on a server.
 *
 *   node scripts/searxng.mjs
 */
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_PATH = join(ROOT, ".env");
const env = {};
for (const line of readFileSync(ENV_PATH, "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m) env[m[1]] = m[2];
}

const BASE = env.COOLIFY_API_URL.replace(/\/$/, "");
const SERVER_UUID = env.COOLIFY_SERVER_UUID ?? "eo4ww8c8w0cgs000sos8g4ow";
const NAME = "pluck-searxng";
const headers = {
  authorization: `Bearer ${env.COOLIFY_API_TOKEN}`,
  accept: "application/json",
  "content-type": "application/json",
  ...(env.CF_ACCESS_CLIENT_ID
    ? {
        "CF-Access-Client-Id": env.CF_ACCESS_CLIENT_ID,
        "CF-Access-Client-Secret": env.CF_ACCESS_CLIENT_SECRET,
      }
    : {}),
};

async function api(path, init = {}) {
  const res = await fetch(`${BASE}/api/v1${path}`, { headers, ...init });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 300) };
  }
  if (!res.ok)
    throw new Error(
      `${init.method ?? "GET"} ${path} -> ${res.status} ${JSON.stringify(json).slice(0, 300)}`,
    );
  return json;
}

const secret = env.SEARXNG_SECRET || randomBytes(24).toString("hex");

// The image ships no JSON output and an enabled rate limiter; both are settings
// file concerns, so the entrypoint writes one before handing over.
const compose = `services:
  searxng:
    image: 'searxng/searxng:latest'
    restart: unless-stopped
    environment:
      - SEARXNG_SECRET=${secret}
      - SEARXNG_BASE_URL=http://searxng:8080/
      - SEARXNG_LIMITER=false
      - SEARXNG_PUBLIC_INSTANCE=false
      # Our own file, so the image's entrypoint cannot regenerate over it.
      - SEARXNG_SETTINGS_PATH=/etc/searxng/pluck.yml
    entrypoint:
      - /bin/sh
      - '-c'
      - |
        mkdir -p /etc/searxng
        cat > /etc/searxng/pluck.yml <<'YAML'
        use_default_settings: true
        general:
          instance_name: "Pluck Search"
        server:
          secret_key: "${secret}"
          limiter: false
          public_instance: false
          image_proxy: false
          method: "GET"
        search:
          safe_search: 1
          formats:
            - html
            - json
        YAML
        exec /usr/local/searxng/entrypoint.sh
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://127.0.0.1:8080/healthz"]
      interval: 15s
      timeout: 5s
      retries: 10
      start_period: 30s
`;

const projects = await api("/projects");
const project = projects.find((p) => p.name === (env.COOLIFY_PROJECT ?? "pluck"));
if (!project) throw new Error("run scripts/coolify.mjs provision first");
const detail = await api(`/projects/${project.uuid}`);
const environment = detail.environments[0];

const services = await api("/services");
let service = services.find((s) => s.name === NAME);
if (!service) {
  service = await api("/services", {
    method: "POST",
    body: JSON.stringify({
      name: NAME,
      description: "Search backend for Pluck",
      project_uuid: project.uuid,
      environment_name: environment.name,
      environment_uuid: environment.uuid,
      server_uuid: SERVER_UUID,
      docker_compose_raw: Buffer.from(compose).toString("base64"),
      // Services get their own Docker network by default, which leaves them
      // unreachable from the API and worker containers.
      connect_to_docker_network: true,
      instant_deploy: true,
    }),
  });
  console.log(`created service ${NAME} (${service.uuid})`);
} else {
  await api(`/services/${service.uuid}`, {
    method: "PATCH",
    body: JSON.stringify({
      docker_compose_raw: Buffer.from(compose).toString("base64"),
      connect_to_docker_network: true,
    }),
  });
  await api(`/services/${service.uuid}/restart`, { method: "POST" });
  console.log(`updated service ${NAME} (${service.uuid})`);
}

// Containers are named "<compose service>-<resource uuid>" on the shared network.
const internalUrl = `http://searxng-${service.uuid}:8080`;
const content = readFileSync(ENV_PATH, "utf8");
const next = /^SEARXNG_URL=.*$/m.test(content)
  ? content.replace(/^SEARXNG_URL=.*$/m, `SEARXNG_URL=${internalUrl}`)
  : `${content.replace(/\s*$/, "")}\nSEARXNG_URL=${internalUrl}\nSEARXNG_SECRET=${secret}\n`;
writeFileSync(ENV_PATH, next);

console.log(`SEARXNG_URL=${internalUrl}`);
console.log("next: node scripts/coolify.mjs env && node scripts/coolify.mjs deploy api worker");
