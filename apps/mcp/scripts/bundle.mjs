#!/usr/bin/env node
/**
 * Builds the npm artefact for @pluckai/mcp.
 *
 * The server imports @pluck/shared, which is a workspace package and will never
 * exist on the registry, so it is inlined here. Real dependencies stay external
 * and are installed by npm as usual, which keeps the published bundle small and
 * lets consumers dedupe the MCP SDK.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));

await build({
  entryPoints: [join(ROOT, "src/stdio.ts"), join(ROOT, "src/http.ts")],
  outdir: join(ROOT, "npm"),
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: false,
  // Anything npm will install for the consumer stays an import.
  external: Object.keys(pkg.dependencies ?? {}),
  // `src/stdio.ts` carries its own shebang; a banner would emit a second one.
  logLevel: "info",
});
