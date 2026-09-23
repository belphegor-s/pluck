import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { endpoints } from "./endpoints.js";

const SNAPSHOT = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../sdk-python/tests/operations.json",
);

describe("Python SDK operation list", () => {
  // The Python SDK is not generated, so its tests check it against this list
  // and this test checks the list against the registry. Adding an endpoint
  // fails here first; regenerate with `node scripts/sdk-ops.mjs`.
  it("matches the endpoint registry", () => {
    const expected = Object.entries(endpoints)
      .map(([id, e]) => ({ id, method: e.method.toUpperCase(), path: e.path }))
      .sort((a, b) => a.id.localeCompare(b.id));
    expect(JSON.parse(readFileSync(SNAPSHOT, "utf8"))).toEqual(expected);
  });
});
