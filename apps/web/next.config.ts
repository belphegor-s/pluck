import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  // Monorepo root, so standalone output traces workspace packages too.
  outputFileTracingRoot: fileURLToPath(new URL("../../", import.meta.url)),
  poweredByHeader: false,
  transpilePackages: ["@pluck/shared", "@pluck/db", "@pluck/ai"],
  serverExternalPackages: ["postgres"],
  experimental: { optimizePackageImports: ["@pluck/shared"] },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "x-content-type-options", value: "nosniff" },
          { key: "referrer-policy", value: "strict-origin-when-cross-origin" },
          { key: "x-frame-options", value: "DENY" },
        ],
      },
    ];
  },
};

export default config;
