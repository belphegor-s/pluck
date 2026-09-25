import { createHash, timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { type AppEnv, INTERNAL_SECRET_HEADER } from "./router.js";
import type { Services } from "./services.js";

/**
 * Operator-only reads for the admin panel, behind the same shared secret the
 * dashboard uses. Nothing here is reachable with an API key.
 */
export function opsRouter(s: Services) {
  const app = new Hono<AppEnv>();

  app.use("*", async (c, next) => {
    const expected = s.config.INTERNAL_API_SECRET;
    const given = c.req.header(INTERNAL_SECRET_HEADER);
    const digest = (v: string) => createHash("sha256").update(v).digest();
    if (!expected || !given || !timingSafeEqual(digest(given), digest(expected)))
      return c.json({ error: { code: "not_found", message: "Not found" } }, 404);
    await next();
  });

  /** Job counts per queue, and how many workers are listening on each. */
  app.get("/queues", async (c) => {
    const queues = await Promise.all(
      Object.entries(s.queues).map(async ([name, queue]) => {
        const [counts, workers] = await Promise.all([
          queue.getJobCounts("waiting", "active", "delayed", "failed", "completed"),
          queue.getWorkersCount(),
        ]);
        return { name, workers, ...counts };
      }),
    );
    return c.json({ queues, at: new Date().toISOString() });
  });

  return app;
}
