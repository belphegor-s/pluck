#!/usr/bin/env node
/**
 * Deploys the two things that tell you when Pluck is broken:
 *
 *   node scripts/observability.mjs            # create or update both services
 *
 * - Bugsink at pluck-errors.procd.cc — speaks the Sentry ingest protocol, so
 *   the reporter in @pluck/runtime needs only a DSN, no SDK and no vendor.
 * - Uptime Kuma at pluck-status.procd.cc — probes and a public status page.
 *
 * Kuma runs on the same host it watches, which cannot report its own death;
 * pair it with one external check (UptimeRobot and friends) against /health.
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
const ERRORS_URL = env.ERRORS_URL ?? "https://pluck-errors.procd.cc";
const STATUS_URL = env.STATUS_URL ?? "https://pluck-status.procd.cc";
const ERRORS_HOST = new URL(ERRORS_URL).host;
const STATUS_HOST = new URL(STATUS_URL).host;

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

function updateEnvFile(values) {
  let content = readFileSync(ENV_PATH, "utf8");
  for (const [key, value] of Object.entries(values)) {
    if (!value) continue;
    const line = `${key}=${value}`;
    const re = new RegExp(`^${key}=.*$`, "m");
    content = re.test(content)
      ? content.replace(re, line)
      : `${content.replace(/\s*$/, "")}\n${line}\n`;
    env[key] = value;
  }
  writeFileSync(ENV_PATH, content);
}

const bugsinkSecret = env.BUGSINK_SECRET_KEY || randomBytes(48).toString("base64url");
const bugsinkDbPassword = env.BUGSINK_DB_PASSWORD || randomBytes(18).toString("base64url");
const bugsinkAdminPassword = env.BUGSINK_ADMIN_PASSWORD || randomBytes(12).toString("base64url");
const bugsinkAdminEmail = env.BUGSINK_ADMIN_EMAIL || "hello@ayushsharma.me";

// `SERVICE_FQDN_<service>_<port>` is Coolify.s hook for routing. The hostname
// has to be written into the compose file itself: Coolify regenerates the
// matching env var from compose on every deploy, so editing it has no effect.
const bugsinkCompose = `services:
  web:
    image: 'bugsink/bugsink:2'
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    environment:
      - SERVICE_FQDN_WEB_8000=${ERRORS_URL}
      - SECRET_KEY=${bugsinkSecret}
      - CREATE_SUPERUSER=${bugsinkAdminEmail}:${bugsinkAdminPassword}
      - PORT=8000
      - DATABASE_URL=postgresql://bugsink:${bugsinkDbPassword}@db:5432/bugsink
      - BEHIND_HTTPS_PROXY=true
      - USE_X_FORWARDED_HOST=true
      - BASE_URL=${ERRORS_URL}
    healthcheck:
      test:
        - CMD-SHELL
        - >-
          python -c 'import requests;
          requests.get("http://localhost:8000/health/ready").raise_for_status()'
      interval: 15s
      timeout: 20s
      retries: 10
      start_period: 40s
  db:
    image: 'postgres:17-alpine'
    restart: unless-stopped
    environment:
      - POSTGRES_USER=bugsink
      - POSTGRES_PASSWORD=${bugsinkDbPassword}
      - POSTGRES_DB=bugsink
    volumes:
      - 'bugsink-db:/var/lib/postgresql/data'
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U bugsink"]
      interval: 10s
      timeout: 5s
      retries: 10
volumes:
  bugsink-db: null
`;

const kumaCompose = `services:
  kuma:
    image: 'louislam/uptime-kuma:1'
    restart: unless-stopped
    environment:
      - SERVICE_FQDN_KUMA_3001=${STATUS_URL}
      - UPTIME_KUMA_DISABLE_FRAME_SAMEORIGIN=false
    volumes:
      - 'kuma-data:/app/data'
    healthcheck:
      test: ["CMD-SHELL", "node extra/healthcheck.js"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 40s
volumes:
  kuma-data: null
`;

const projects = await api("/projects");
const project = projects.find((p) => p.name === (env.COOLIFY_PROJECT ?? "pluck"));
if (!project) throw new Error("run scripts/coolify.mjs provision first");
const environment = (await api(`/projects/${project.uuid}`)).environments[0];
const services = await api("/services");

// Written before anything is deployed so a failed run leaves the credentials
// that the containers were actually given.
updateEnvFile({
  BUGSINK_SECRET_KEY: bugsinkSecret,
  BUGSINK_DB_PASSWORD: bugsinkDbPassword,
  BUGSINK_ADMIN_EMAIL: bugsinkAdminEmail,
  BUGSINK_ADMIN_PASSWORD: bugsinkAdminPassword,
  ERRORS_URL,
  STATUS_URL,
});

async function ensureService(name, description, compose) {
  let service = services.find((s) => s.name === name);
  const body = { docker_compose_raw: Buffer.from(compose).toString("base64") };
  if (!service) {
    service = await api("/services", {
      method: "POST",
      body: JSON.stringify({
        ...body,
        name,
        description,
        project_uuid: project.uuid,
        environment_name: environment.name,
        environment_uuid: environment.uuid,
        server_uuid: SERVER_UUID,
        instant_deploy: false,
      }),
    });
    console.log(`created service ${name} (${service.uuid})`);
  } else {
    console.log(`found service ${name} (${service.uuid})`);
  }
  // Only PATCH accepts the network flag; Kuma needs it to reach containers by
  // name, so it can probe the API without leaving the host.
  await api(`/services/${service.uuid}`, {
    method: "PATCH",
    body: JSON.stringify({ ...body, connect_to_docker_network: true }),
  });

  // `start` deploys a new service; a running one has to be restarted instead to
  // pick up a changed compose file.
  await api(`/services/${service.uuid}/start`, { method: "POST" }).catch(() =>
    api(`/services/${service.uuid}/restart`, { method: "POST" }),
  );
  return service;
}

await ensureService("pluck-bugsink", "Error tracking (Sentry protocol)", bugsinkCompose);
await ensureService("pluck-uptime", "Uptime checks and public status page", kumaCompose);

console.log(`
Bugsink  ${ERRORS_URL}   sign in as ${bugsinkAdminEmail} / ${bugsinkAdminPassword}
Kuma     ${STATUS_URL}   first visit creates the admin account

Next: create a Bugsink project, copy its DSN into SENTRY_DSN in .env, then
  node scripts/coolify.mjs env && node scripts/coolify.mjs deploy api worker`);
