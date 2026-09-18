import "server-only";
import { ProxyPool } from "@pluck/core";
import { ProxyDirectory } from "@pluck/runtime";
import { db } from "@/lib/db";

const globalForProxies = globalThis as unknown as { pluckProxies?: ProxyDirectory };

/**
 * The dashboard shares the API's proxy rules rather than reimplementing them,
 * so a URL the dashboard accepts is exactly one the scraper can use. One
 * instance per process keeps its short-lived cache useful across requests.
 */
export function proxyDirectory(): ProxyDirectory {
  globalForProxies.pluckProxies ??= new ProxyDirectory(
    db,
    {
      PLUCK_ENCRYPTION_KEY: process.env.PLUCK_ENCRYPTION_KEY ?? "",
      ALLOW_PRIVATE_NETWORK: process.env.ALLOW_PRIVATE_NETWORK === "true",
    },
    ProxyPool.fromEnv(process.env),
  );
  return globalForProxies.pluckProxies;
}
