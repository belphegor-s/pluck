#!/usr/bin/env node
/**
 * Provision and deploy Pluck on a Coolify instance.
 *
 *   node scripts/coolify.mjs provision   # create project, databases and apps (idempotent)
 *   node scripts/coolify.mjs env         # push environment variables from .env
 *   node scripts/coolify.mjs deploy      # trigger a deployment of every app
 *   node scripts/coolify.mjs release     # deploy only what changed, and wait for it
 *   node scripts/coolify.mjs status      # show resource status
 *
 * `release` is what CI runs after a green build on main (see
 * .github/workflows/deploy.yml). It compares each app's last finished
 * deployment with the checked-out commit, deploys the apps whose inputs
 * changed, one at a time, and fails if a rollout does. `release --dry-run`
 * only prints the plan; `release web api` deploys those whatever changed.
 * It needs an API token that can read and deploy, nothing more.
 *
 * Reads COOLIFY_API_URL, COOLIFY_API_TOKEN and, when the instance sits behind
 * Cloudflare Access, CF_ACCESS_CLIENT_ID / CF_ACCESS_CLIENT_SECRET from .env.
 */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_PATH = join(ROOT, ".env");

const env = readEnv();
const BASE = (env.COOLIFY_API_URL ?? "").replace(/\/$/, "");
const SERVER_UUID = env.COOLIFY_SERVER_UUID ?? "eo4ww8c8w0cgs000sos8g4ow";
const PROJECT_NAME = env.COOLIFY_PROJECT ?? "pluck";
const REPO = env.PLUCK_REPO ?? "belphegor-s/pluck";
const BRANCH = env.PLUCK_BRANCH ?? "main";
const DOMAINS = {
  web: env.PUBLIC_WEB_URL ?? "https://pluck.procd.cc",
  api: env.PUBLIC_API_URL ?? "https://pluck-api.procd.cc",
  mcp: env.PUBLIC_MCP_URL ?? "https://pluck-mcp.procd.cc",
};

if (!BASE || !env.COOLIFY_API_TOKEN) {
  console.error("COOLIFY_API_URL and COOLIFY_API_TOKEN are required in .env");
  process.exit(1);
}

// `memory` caps each container so a runaway browser or build cannot take the
// whole host down; the numbers assume a small shared server.
const APPS = [
  { key: "api", name: "pluck-api", target: "api", port: "8080", domain: DOMAINS.api, memory: "1g" },
  {
    key: "worker",
    name: "pluck-worker",
    target: "worker",
    port: "8080",
    domain: null,
    memory: "2g",
  },
  {
    key: "mcp",
    name: "pluck-mcp",
    target: "mcp",
    port: "8081",
    domain: DOMAINS.mcp,
    memory: "512m",
  },
  { key: "web", name: "pluck-web", target: "web", port: "3000", domain: DOMAINS.web, memory: "1g" },
];

const DATABASES = [
  { key: "postgres", kind: "postgresql", name: "pluck-postgres" },
  { key: "redis", kind: "redis", name: "pluck-redis" },
  { key: "cache", kind: "redis", name: "pluck-redis-cache" },
];

async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    method,
    headers: {
      authorization: `Bearer ${env.COOLIFY_API_TOKEN}`,
      accept: "application/json",
      ...(body ? { "content-type": "application/json" } : {}),
      ...(env.CF_ACCESS_CLIENT_ID
        ? {
            "CF-Access-Client-Id": env.CF_ACCESS_CLIENT_ID,
            "CF-Access-Client-Secret": env.CF_ACCESS_CLIENT_SECRET,
          }
        : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 400) };
  }
  if (!res.ok)
    throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(json).slice(0, 500)}`);
  return json;
}

function readEnv() {
  const out = {};
  try {
    for (const line of readFileSync(ENV_PATH, "utf8").split(/\r?\n/)) {
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (match) out[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // No .env yet; rely on the process environment.
  }
  return { ...out, ...process.env };
}

/** Writes generated secrets and discovered connection strings back into .env. */
function updateEnvFile(values) {
  let content = "";
  try {
    content = readFileSync(ENV_PATH, "utf8");
  } catch {
    content = "";
  }
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null || value === "") continue;
    const line = `${key}=${value}`;
    const re = new RegExp(`^${key}=.*$`, "m");
    content = re.test(content)
      ? content.replace(re, line)
      : `${content.replace(/\s*$/, "")}\n${line}\n`;
    env[key] = value;
  }
  writeFileSync(ENV_PATH, content.startsWith("\n") ? content.slice(1) : content);
}

const secret = (bytes = 32) => randomBytes(bytes).toString("hex");

async function ensureProject() {
  const projects = await api("/projects");
  const existing = projects.find((p) => p.name === PROJECT_NAME);
  const project =
    existing ??
    (await api("/projects", {
      method: "POST",
      body: { name: PROJECT_NAME, description: "Open-source web context API for AI" },
    }));
  const detail = await api(`/projects/${project.uuid}`);
  const environment = detail.environments?.[0];
  if (!environment) throw new Error("project has no environment");
  console.log(`${existing ? "found" : "created"} project ${PROJECT_NAME} (${project.uuid})`);
  return {
    projectUuid: project.uuid,
    environmentUuid: environment.uuid,
    environmentName: environment.name,
  };
}

async function ensureDatabases(ctx) {
  const all = await api("/databases");
  const result = {};
  for (const spec of DATABASES) {
    let db = all.find((d) => d.name === spec.name);
    if (!db) {
      const created = await api(`/databases/${spec.kind}`, {
        method: "POST",
        body: {
          server_uuid: SERVER_UUID,
          project_uuid: ctx.projectUuid,
          environment_name: ctx.environmentName,
          environment_uuid: ctx.environmentUuid,
          name: spec.name,
          description: `Pluck ${spec.key}`,
          is_public: false,
          instant_deploy: true,
          ...(spec.kind === "postgresql"
            ? {
                postgres_user: "pluck",
                postgres_db: "pluck",
                postgres_password: secret(18),
                image: "postgres:18-alpine",
              }
            : { image: "redis:8-alpine" }),
        },
      });
      db = (await api("/databases")).find((d) => d.uuid === created.uuid) ?? created;
      console.log(`created ${spec.kind} ${spec.name} (${db.uuid})`);
    } else {
      console.log(`found ${spec.kind} ${spec.name} (${db.uuid})`);
    }
    result[spec.key] = db;
  }
  return result;
}

async function ensureApps(ctx) {
  const all = await api("/applications");
  const result = {};
  for (const spec of APPS) {
    let app = all.find((a) => a.name === spec.name);
    if (!app) {
      const created = await api("/applications/public", {
        method: "POST",
        body: {
          project_uuid: ctx.projectUuid,
          server_uuid: SERVER_UUID,
          environment_name: ctx.environmentName,
          environment_uuid: ctx.environmentUuid,
          git_repository: `https://github.com/${REPO}`,
          git_branch: BRANCH,
          build_pack: "dockerfile",
          dockerfile_location: "/Dockerfile",
          ports_exposes: spec.port,
          name: spec.name,
          description: `Pluck ${spec.key}`,
          instant_deploy: false,
          ...(spec.domain ? { domains: spec.domain } : {}),
        },
      });
      app = { uuid: created.uuid, name: spec.name };
      console.log(`created app ${spec.name} (${app.uuid})`);
    } else {
      console.log(`found app ${spec.name} (${app.uuid})`);
    }

    // The build target cannot be set at creation time.
    //
    // Coolify's own health check shells out to curl or wget, which the slim
    // Node images deliberately do not ship. Every image declares its own
    // HEALTHCHECK instead (see the Dockerfile), so Coolify's is left off and it
    // reads the container's reported health during a rolling update.
    await api(`/applications/${app.uuid}`, {
      method: "PATCH",
      body: {
        dockerfile_target_build: spec.target,
        ports_exposes: spec.port,
        ...(spec.domain ? { domains: spec.domain } : {}),
        health_check_enabled: false,
        limits_memory: spec.memory,
        limits_memory_swap: spec.memory,
      },
    });
    result[spec.key] = app;
  }
  return result;
}

function buildEnv(dbs) {
  const postgres = dbs.postgres.internal_db_url;
  const redis = dbs.redis.internal_db_url;
  const cache = dbs.cache.internal_db_url;
  if (!postgres || !redis || !cache)
    throw new Error("databases are missing internal connection URLs; deploy them first");

  const generated = {
    PLUCK_ENCRYPTION_KEY: env.PLUCK_ENCRYPTION_KEY || secret(32),
    BOOTSTRAP_API_KEY: env.BOOTSTRAP_API_KEY || `pk_live_${secret(24)}`,
    INTERNAL_API_SECRET: env.INTERNAL_API_SECRET || secret(32),
    BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET || secret(32),
    DATABASE_URL: postgres,
    REDIS_URL: redis,
    CACHE_REDIS_URL: cache,
  };
  updateEnvFile(generated);

  // Polar keeps separate sandbox and live credentials; `_PROD` suffixed values
  // win once POLAR_SERVER is production, so both sets can live in one .env.
  const live = (env.POLAR_SERVER || "sandbox") === "production";
  const polar = (key) => (live ? (env[`${key}_PROD`] ?? env[key]) : env[key]);

  const shared = {
    NODE_ENV: "production",
    LOG_LEVEL: env.LOG_LEVEL || "info",
    DATABASE_URL: postgres,
    REDIS_URL: redis,
    CACHE_REDIS_URL: cache,
    PLUCK_ENCRYPTION_KEY: generated.PLUCK_ENCRYPTION_KEY,
    PUBLIC_API_URL: DOMAINS.api,
    PUBLIC_WEB_URL: DOMAINS.web,
    BILLING_ENABLED: env.BILLING_ENABLED || "true",
    ALLOW_PRIVATE_NETWORK: "false",
    RATE_LIMIT_PER_MINUTE: env.RATE_LIMIT_PER_MINUTE || "300",
    S3_ENDPOINT: env.S3_ENDPOINT,
    S3_REGION: env.S3_REGION,
    S3_BUCKET: env.S3_BUCKET,
    S3_ACCESS_KEY_ID: env.S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: env.S3_SECRET_ACCESS_KEY,
    STORAGE_PUBLIC_URL: env.STORAGE_PUBLIC_URL,
    PLUCK_LLM_PROVIDER: env.PLUCK_LLM_PROVIDER,
    PLUCK_LLM_API_KEY: env.PLUCK_LLM_API_KEY || env.OPENROUTER_API_KEY,
    PLUCK_LLM_MODEL: env.PLUCK_LLM_MODEL,
    SEARCH_PROVIDERS: env.SEARCH_PROVIDERS,
    BRAVE_API_KEY: env.BRAVE_API_KEY,
    SERPER_API_KEY: env.SERPER_API_KEY,
    SEARXNG_URL: env.SEARXNG_URL,
    PROXY_DATACENTER_URLS: env.PROXY_DATACENTER_URLS,
    PROXY_RESIDENTIAL_URLS: env.PROXY_RESIDENTIAL_URLS,
    RESEND_API_KEY: env.RESEND_API_KEY,
    EMAIL_FROM: env.EMAIL_FROM || "Pluck <hello@procd.cc>",
    CONTACT_EMAIL: env.CONTACT_EMAIL || "hello@ayushsharma.me",
    SENTRY_DSN: env.SENTRY_DSN,
    SENTRY_ENVIRONMENT: env.SENTRY_ENVIRONMENT || "production",
    ALERT_WEBHOOK_URL: env.ALERT_WEBHOOK_URL,
    TELEGRAM_BOT_TOKEN: env.TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ID: env.TELEGRAM_CHAT_ID,
    LOW_BALANCE_CREDITS: env.LOW_BALANCE_CREDITS,
  };

  return {
    api: {
      ...shared,
      PORT: "8080",
      BOOTSTRAP_API_KEY: generated.BOOTSTRAP_API_KEY,
      INTERNAL_API_SECRET: generated.INTERNAL_API_SECRET,
      POLAR_ACCESS_TOKEN: polar("POLAR_ACCESS_TOKEN"),
      POLAR_WEBHOOK_SECRET: polar("POLAR_WEBHOOK_SECRET"),
      POLAR_SERVER: env.POLAR_SERVER || "sandbox",
    },
    worker: {
      ...shared,
      // Each Chromium costs 300-500 MB. Raise only with headroom to spare.
      BROWSER_CONCURRENCY: env.BROWSER_CONCURRENCY || "2",
      CRAWL_CONCURRENCY: env.CRAWL_CONCURRENCY || "1",
      WORKER_ROLES: env.WORKER_ROLES || "render,crawl,monitor,webhook,maintenance",
    },
    mcp: { PORT: "8081", PLUCK_API_INTERNAL_URL: DOMAINS.api, PUBLIC_API_URL: DOMAINS.api },
    web: {
      ...shared,
      PORT: "3000",
      BETTER_AUTH_SECRET: generated.BETTER_AUTH_SECRET,
      BETTER_AUTH_URL: DOMAINS.web,
      INTERNAL_API_SECRET: generated.INTERNAL_API_SECRET,
      GITHUB_CLIENT_ID: env.GITHUB_CLIENT_ID,
      GITHUB_CLIENT_SECRET: env.GITHUB_CLIENT_SECRET,
      ADMIN_USERNAME: env.ADMIN_USERNAME,
      ADMIN_PASSWORD_HASH: env.ADMIN_PASSWORD_HASH,
      DEMO_API_KEY: env.DEMO_API_KEY || generated.BOOTSTRAP_API_KEY,
      POLAR_ACCESS_TOKEN: polar("POLAR_ACCESS_TOKEN"),
      POLAR_SERVER: env.POLAR_SERVER || "sandbox",
      POLAR_PRODUCT_STARTER: polar("POLAR_PRODUCT_STARTER"),
      POLAR_PRODUCT_BUILDER: polar("POLAR_PRODUCT_BUILDER"),
      POLAR_PRODUCT_SCALE: polar("POLAR_PRODUCT_SCALE"),
      POLAR_PRODUCT_HYPER: polar("POLAR_PRODUCT_HYPER"),
      NEXT_PUBLIC_API_URL: DOMAINS.api,
      NEXT_PUBLIC_SITE_URL: DOMAINS.web,
      NEXT_PUBLIC_MCP_URL: DOMAINS.mcp,
    },
  };
}

async function pushEnv(apps, dbs) {
  const plans = buildEnv(dbs);
  for (const spec of APPS) {
    const app = apps[spec.key];
    const plan = plans[spec.key];
    const data = Object.entries(plan)
      .filter(([, value]) => value !== undefined && value !== null && value !== "")
      .map(([key, value]) => ({
        key,
        value: String(value),
        is_preview: false,
        is_build_time: key.startsWith("NEXT_PUBLIC_"),
      }));
    await api(`/applications/${app.uuid}/envs/bulk`, { method: "PATCH", body: { data } });
    console.log(`set ${data.length} env vars on ${spec.name}`);
  }
}

/**
 * Deploys are serialised: two image builds at once starved a 4-core host badly
 * enough to take every site on it offline. Each build waits for the previous
 * one to leave the queue before the next is asked for.
 */
async function deploy(apps, only = []) {
  const targets = only.length ? APPS.filter((a) => only.includes(a.key)) : APPS;
  for (const [index, spec] of targets.entries()) {
    if (index > 0) await waitForIdleBuilds();
    const res = await api(`/deploy?uuid=${apps[spec.key].uuid}&force=false`, { method: "POST" });
    const id = res.deployments?.[0]?.deployment_uuid ?? res.message ?? "queued";
    console.log(`deploying ${spec.name}: ${id}`);
  }
}

async function waitForIdleBuilds(timeoutMs = 25 * 60_000) {
  const names = new Set(APPS.map((a) => a.name));
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 15_000));
    let active;
    try {
      active = await api("/deployments");
    } catch {
      // The API itself goes unresponsive when the host is loaded: keep waiting.
      continue;
    }
    const mine = (Array.isArray(active) ? active : []).filter((d) => names.has(d.application_name));
    if (mine.length === 0) return;
    process.stdout.write(`  waiting for ${mine.map((d) => d.application_name).join(", ")}\r`);
  }
  console.log("\n  build queue still busy; continuing anyway");
}

/** Files every image is built from: a change to one rebuilds them all. */
const SHARED_INPUTS = [
  "Dockerfile",
  ".dockerignore",
  ".node-version",
  ".npmrc",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "tsconfig.base.json",
  "turbo.json",
];

/**
 * The worker goes first: it must be able to read a job shape before the API
 * starts producing it, never the other way round.
 */
const RELEASE_ORDER = ["worker", "api", "mcp", "web"];

const HEALTH = {
  api: `${DOMAINS.api}/health`,
  mcp: `${DOMAINS.mcp}/health`,
  web: `${DOMAINS.web}/api/health`,
};

const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();

/** Every workspace package: where it lives and which others it depends on. */
function workspaceGraph() {
  const graph = {};
  for (const group of ["apps", "packages"]) {
    for (const entry of readdirSync(join(ROOT, group), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      try {
        const pkg = JSON.parse(readFileSync(join(ROOT, group, entry.name, "package.json"), "utf8"));
        graph[pkg.name] = {
          dir: `${group}/${entry.name}/`,
          deps: Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }),
        };
      } catch {
        // Not a JavaScript package (the Python SDK).
      }
    }
  }
  return graph;
}

/** The directories an app's image is built from: its own, and its workspace dependencies'. */
function inputDirs(key, graph) {
  const seen = new Set();
  const queue = [Object.values(graph).find((pkg) => pkg.dir === `apps/${key}/`)];
  while (queue.length) {
    const pkg = queue.pop();
    if (!pkg || seen.has(pkg.dir)) continue;
    seen.add(pkg.dir);
    for (const dep of pkg.deps) if (graph[dep]) queue.push(graph[dep]);
  }
  return [...seen];
}

/**
 * Why an app needs deploying, or null when what is running already matches.
 *
 * The comparison is against the commit of the app's last finished deployment,
 * not against the previous push, so a run that was skipped, cancelled or
 * failed is made up for by the next one.
 */
async function reasonToDeploy(uuid, key, graph, head) {
  const { deployments = [] } = await api(`/deployments/applications/${uuid}?take=10`);
  const deployed = deployments.find((d) => d.status === "finished")?.commit;
  if (!deployed) return "never deployed";
  if (deployed === head) return null;
  let changed;
  try {
    changed = git("diff", "--name-only", deployed, head).split("\n").filter(Boolean);
  } catch {
    return `running ${deployed.slice(0, 7)}, which is not in this checkout`;
  }
  const dirs = inputDirs(key, graph);
  const hits = changed.filter(
    (file) => SHARED_INPUTS.includes(file) || dirs.some((dir) => file.startsWith(dir)),
  );
  if (hits.length === 0) return null;
  const more = hits.length > 1 ? ` and ${hits.length - 1} more` : "";
  return `${hits[0]}${more} changed since ${deployed.slice(0, 7)}`;
}

async function waitForDeployment(deploymentUuid, timeoutMs = 40 * 60_000) {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 15_000));
    let status;
    try {
      ({ status } = await api(`/deployments/${deploymentUuid}`));
    } catch {
      // The API stalls while the host is busy building: ask again.
      continue;
    }
    if (status !== last) console.log(`  ${status}`);
    last = status;
    if (status === "finished") return;
    if (status !== "queued" && status !== "in_progress")
      throw new Error(`deployment ${deploymentUuid} ended as "${status}"`);
  }
  throw new Error(`deployment ${deploymentUuid} did not finish in time`);
}

async function waitForHealth(url) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const ok = await fetch(url, { signal: AbortSignal.timeout(10_000) })
      .then((res) => res.ok)
      .catch(() => false);
    if (ok) return;
    await new Promise((resolve) => setTimeout(resolve, 6_000));
  }
  throw new Error(`${url} is not answering after the deployment`);
}

async function release(only, dryRun) {
  const all = await api("/applications");
  const graph = workspaceGraph();
  const head = git("rev-parse", "HEAD");
  console.log(`release of ${head.slice(0, 7)}`);

  const plan = [];
  for (const key of RELEASE_ORDER) {
    const spec = APPS.find((a) => a.key === key);
    const app = all.find((a) => a.name === spec.name);
    if (!app) throw new Error(`${spec.name} does not exist; run provision first`);
    const reason = only.length
      ? only.includes(key) && "asked for"
      : await reasonToDeploy(app.uuid, key, graph, head);
    console.log(`${spec.name.padEnd(14)} ${reason ? `deploy: ${reason}` : "up to date"}`);
    if (reason) plan.push({ spec, uuid: app.uuid });
  }
  if (dryRun || plan.length === 0) return;

  for (const { spec, uuid } of plan) {
    // One build at a time, and never on top of one somebody started by hand.
    await waitForIdleBuilds();
    const res = await api(`/deploy?uuid=${uuid}&force=false`, { method: "POST" });
    const id = res.deployments?.[0]?.deployment_uuid;
    if (!id) throw new Error(`${spec.name} was not queued: ${JSON.stringify(res).slice(0, 300)}`);
    console.log(`\ndeploying ${spec.name}: ${id}`);
    await waitForDeployment(id);
    if (HEALTH[spec.key]) await waitForHealth(HEALTH[spec.key]);
    console.log(`${spec.name} is live`);
  }
}

async function status() {
  const [apps, dbs] = await Promise.all([api("/applications"), api("/databases")]);
  const mine = new Set([...APPS.map((a) => a.name), ...DATABASES.map((d) => d.name)]);
  for (const r of [...dbs, ...apps]) {
    if (mine.has(r.name))
      console.log(
        `${r.name.padEnd(20)} ${String(r.status ?? "?").padEnd(28)} ${r.fqdn ?? r.internal_db_url?.replace(/:[^:@]+@/, ":***@") ?? ""}`,
      );
  }
}

const command = process.argv[2] ?? "provision";
// `status` and `release` only read and deploy; they never touch configuration.
const ctx = command === "status" || command === "release" ? null : await ensureProject();

if (command === "provision") {
  const dbs = await ensureDatabases(ctx);
  const apps = await ensureApps(ctx);
  await pushEnv(apps, dbs);
  console.log("\nprovisioned. next: node scripts/coolify.mjs deploy");
} else if (command === "env") {
  const dbs = await ensureDatabases(ctx);
  const apps = await ensureApps(ctx);
  await pushEnv(apps, dbs);
} else if (command === "deploy") {
  // `deploy api worker` redeploys just those; no arguments means all of them.
  const only = process.argv.slice(3).filter((k) => APPS.some((a) => a.key === k));
  const apps = await ensureApps(ctx);
  await deploy(apps, only);
} else if (command === "release") {
  const args = process.argv.slice(3);
  const only = args.filter((k) => APPS.some((a) => a.key === k));
  await release(only, args.includes("--dry-run"));
} else if (command === "status") {
  await status();
} else {
  console.error(`unknown command: ${command}`);
  process.exit(1);
}
