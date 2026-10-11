import { defineConfig } from "vitest/config";
import { createBuildConfig } from "./scripts/config.mjs";

export default defineConfig({
  define: { __PLUCK__: JSON.stringify(createBuildConfig({ version: "0.0.0-test" })) },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
