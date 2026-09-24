#!/usr/bin/env node
/**
 * Writes the third-party licence list the site shows at /legal/licenses.
 *
 *   node scripts/licenses.mjs
 *
 * Walks the production dependency tree of every app (web, api, worker, mcp),
 * so it lists what a production install contains, not the root's build
 * tooling, and reads each licence from the package's own package.json. Run
 * after adding or upgrading a dependency and commit the result.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OURS = /^@pluck\/|^@pluckai\//;

// A fixed command with no interpolated input, so running it through the
// shell (which Windows needs for pnpm) is safe.
const trees = JSON.parse(
  execSync('pnpm -r --filter "./apps/*" list --prod --depth Infinity --json', {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  }),
);

const found = new Map();
const walk = (deps) => {
  for (const [name, dep] of Object.entries(deps ?? {})) {
    const key = `${name}@${dep.version}`;
    if (found.has(key)) continue;
    found.set(key, { name, version: dep.version, path: dep.path });
    walk(dep.dependencies);
  }
};
for (const tree of trees) walk(tree.dependencies);

const licenseOf = (manifest) => {
  const raw = manifest.license ?? manifest.licenses;
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) return raw.map((l) => l.type ?? l).join(" OR ");
  if (raw?.type) return raw.type;
  return "UNKNOWN";
};

/**
 * Platform-specific binaries (esbuild, sharp, msgpackr) are only installed
 * for the machine running this, but the production image installs its own,
 * so their manifests come from the registry at the exact version instead.
 */
async function manifestFor(name, version, path) {
  const file = path && join(path, "package.json");
  if (file && existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  const res = await fetch(`https://registry.npmjs.org/${name.replace("/", "%2F")}/${version}`);
  return res.ok ? res.json() : {};
}

/** Repository fields come in many shapes; the page wants a plain https link. */
function repoUrl(manifest) {
  const raw =
    typeof manifest.repository === "string" ? manifest.repository : manifest.repository?.url;
  if (!raw) return null;
  // GitHub shorthand: "owner/name" or "github:owner/name".
  const short = /^(?:github:)?([\w.-]+\/[\w.-]+)$/.exec(raw);
  if (short) return `https://github.com/${short[1]}`;
  return raw
    .replace(/^git\+/, "")
    .replace(/^git:\/\//, "https://")
    .replace(/^ssh:\/\/git@/, "https://")
    .replace(/^git@([^:]+):/, "https://$1/")
    .replace(/\.git$/, "");
}

const byName = new Map();
for (const { name, version, path } of found.values()) {
  if (OURS.test(name)) continue;
  const manifest = await manifestFor(name, version, path);
  const entry = byName.get(name) ?? {
    name,
    versions: new Set(),
    license: licenseOf(manifest),
    url: manifest.homepage || repoUrl(manifest) || `https://www.npmjs.com/package/${name}`,
  };
  entry.versions.add(version);
  byName.set(name, entry);
}

const packages = [...byName.values()]
  .map((p) => ({
    name: p.name,
    version: [...p.versions].join(", "),
    license: p.license,
    url: p.url,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

writeFileSync(
  join(ROOT, "apps/web/src/lib/licenses.generated.json"),
  `${JSON.stringify(packages, null, 1)}\n`,
);
const unknown = packages.filter((p) => p.license === "UNKNOWN").map((p) => p.name);
console.log(
  `${packages.length} packages${unknown.length ? `; no licence field: ${unknown.join(", ")}` : ""}`,
);
