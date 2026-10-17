import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  // Monorepo root, so standalone output traces workspace packages too.
  outputFileTracingRoot: fileURLToPath(new URL("../../", import.meta.url)),
  poweredByHeader: false,
  // AGENTS.md is ours to keep in house style; next dev would rewrite it.
  agentRules: false,
  transpilePackages: ["@pluck/shared", "@pluck/db", "@pluck/ai"],
  serverExternalPackages: ["postgres", "sharp"],
  experimental: { optimizePackageImports: ["@pluck/shared"] },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "x-content-type-options", value: "nosniff" },
          { key: "referrer-policy", value: "strict-origin-when-cross-origin" },
          // Framable only by the portfolio, which shows the site live in its project cards.
          {
            key: "content-security-policy",
            value: "frame-ancestors 'self' https://ayushsharma.me https://www.ayushsharma.me",
          },
          { key: "strict-transport-security", value: "max-age=31536000; includeSubDomains" },
          {
            key: "permissions-policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
          },
        ],
      },
    ];
  },
};

export default config;
