import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { request } from "undici";
import type { Config } from "./config.js";
import type { Logger } from "./infra.js";

/**
 * Error reporting without an SDK.
 *
 * Sentry's ingest API is a three-line envelope over HTTP, so a direct POST
 * costs ~100 lines and no dependency tree — worth it for a self-hostable
 * service where observability must stay optional. With no DSN the reporter
 * is inert and only logs, which is exactly what a self-hoster wants.
 */

export interface ErrorContext {
  requestId?: string;
  userId?: string;
  endpoint?: string;
  queue?: string;
  jobId?: string;
  url?: string;
  [key: string]: unknown;
}

const MAX_EVENTS_PER_MINUTE = 60;
/** Identical errors repeat in bursts; one report per fingerprint per window. */
const DEDUPE_WINDOW_MS = 60_000;

type Dsn = { url: string; publicKey: string; raw: string };

function parseDsn(dsn: string): Dsn | null {
  try {
    const u = new URL(dsn);
    const projectId = u.pathname.replace(/^\/+/, "");
    if (!u.username || !projectId) return null;
    return {
      url: `${u.protocol}//${u.host}/api/${projectId}/envelope/`,
      publicKey: u.username,
      raw: `${u.protocol}//${u.username}@${u.host}/${projectId}`,
    };
  } catch {
    return null;
  }
}

const FRAME = /^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/;

/** V8 stack text → Sentry frames, oldest first, app frames flagged. */
function framesFrom(stack: string) {
  const frames = [];
  for (const line of stack.split("\n").slice(1)) {
    const m = FRAME.exec(line);
    if (!m) continue;
    const file = m[2]!;
    frames.push({
      function: m[1] ?? "<anonymous>",
      filename: file.replace(/^file:\/\//, ""),
      lineno: Number(m[3]),
      colno: Number(m[4]),
      in_app: !file.includes("node_modules") && !file.startsWith("node:"),
    });
  }
  return frames.reverse();
}

function describe(err: unknown): { type: string; value: string; stack?: string } {
  if (err instanceof Error)
    return { type: err.name || "Error", value: err.message, stack: err.stack };
  return { type: "Error", value: typeof err === "string" ? err : JSON.stringify(err) };
}

export interface ErrorReporter {
  /** Report an unexpected failure. Never throws and never blocks the caller. */
  capture(err: unknown, context?: ErrorContext): void;
  /** Report an operational condition a human should look at (paging webhook). */
  alert(title: string, detail?: Record<string, unknown>): void;
  close(): Promise<void>;
}

class Reporter implements ErrorReporter {
  private readonly seen = new Map<string, number>();
  private sentThisMinute = 0;
  private minute = 0;
  private inFlight = new Set<Promise<unknown>>();

  constructor(
    private readonly service: string,
    private readonly log: Logger,
    private readonly dsn: Dsn | null,
    private readonly alertUrl: string | undefined,
    private readonly environment: string,
    private readonly release: string | undefined,
  ) {}

  private budget(key: string): boolean {
    const now = Date.now();
    const minute = Math.floor(now / 60_000);
    if (minute !== this.minute) {
      this.minute = minute;
      this.sentThisMinute = 0;
      for (const [k, at] of this.seen) if (now - at > DEDUPE_WINDOW_MS) this.seen.delete(k);
    }
    const last = this.seen.get(key);
    if (last && now - last < DEDUPE_WINDOW_MS) return false;
    if (this.sentThisMinute >= MAX_EVENTS_PER_MINUTE) return false;
    this.seen.set(key, now);
    this.sentThisMinute += 1;
    return true;
  }

  private send(url: string, body: string, contentType: string) {
    const p = request(url, {
      method: "POST",
      headers: { "content-type": contentType },
      body,
      headersTimeout: 5_000,
      bodyTimeout: 5_000,
    })
      .then((res) => res.body.dump())
      .catch((err: unknown) => this.log.debug({ err }, "error report failed to send"))
      .finally(() => this.inFlight.delete(p));
    this.inFlight.add(p);
  }

  capture(err: unknown, context: ErrorContext = {}): void {
    const { type, value, stack } = describe(err);
    this.log.error({ err, ...context }, "captured error");
    if (!this.dsn || !this.budget(`${type}:${value}:${context.endpoint ?? context.queue ?? ""}`))
      return;

    const { requestId, userId, endpoint, queue, jobId, url, ...extra } = context;
    const eventId = randomUUID().replace(/-/g, "");
    const event = {
      event_id: eventId,
      timestamp: Date.now() / 1000,
      platform: "node",
      level: "error",
      logger: this.service,
      server_name: hostname(),
      environment: this.environment,
      release: this.release,
      transaction: endpoint ?? (queue ? `queue:${queue}` : undefined),
      tags: { service: this.service, endpoint, queue },
      user: userId ? { id: userId } : undefined,
      request: url ? { url } : undefined,
      extra: { requestId, jobId, ...extra },
      exception: {
        values: [{ type, value, stacktrace: stack ? { frames: framesFrom(stack) } : undefined }],
      },
    };
    const envelope = [
      JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString(), dsn: this.dsn.raw }),
      JSON.stringify({ type: "event", content_type: "application/json" }),
      JSON.stringify(event),
    ].join("\n");
    this.send(
      `${this.dsn.url}?sentry_key=${this.dsn.publicKey}&sentry_version=7`,
      envelope,
      "application/x-sentry-envelope",
    );
  }

  alert(title: string, detail: Record<string, unknown> = {}): void {
    this.log.warn(detail, title);
    if (!this.alertUrl || !this.budget(`alert:${title}`)) return;
    const lines = Object.entries(detail).map(([k, v]) => `${k}: ${String(v)}`);
    const text = [`[${this.service}] ${title}`, ...lines].join("\n");
    // `text` suits Slack, `content` suits Discord; the rest is for anything else.
    this.send(
      this.alertUrl,
      JSON.stringify({
        text,
        content: text,
        service: this.service,
        environment: this.environment,
        title,
        detail,
      }),
      "application/json",
    );
  }

  async close(): Promise<void> {
    await Promise.allSettled([...this.inFlight]);
  }
}

export function createErrorReporter(
  config: Pick<Config, "SENTRY_DSN" | "SENTRY_ENVIRONMENT" | "NODE_ENV" | "ALERT_WEBHOOK_URL">,
  service: string,
  log: Logger,
): ErrorReporter {
  const dsn = config.SENTRY_DSN ? parseDsn(config.SENTRY_DSN) : null;
  if (config.SENTRY_DSN && !dsn) log.warn("SENTRY_DSN is malformed; error reporting is disabled");
  return new Reporter(
    service,
    log,
    dsn,
    config.ALERT_WEBHOOK_URL,
    config.SENTRY_ENVIRONMENT ?? config.NODE_ENV,
    process.env.RELEASE_SHA?.slice(0, 12),
  );
}

/**
 * Last-resort handlers. An uncaught exception leaves the process in an unknown
 * state, so we report, then let the supervisor restart us.
 */
export function installProcessHandlers(reporter: ErrorReporter, exit: () => Promise<void>) {
  process.on("unhandledRejection", (reason) => {
    reporter.capture(reason, { kind: "unhandledRejection" });
  });
  process.on("uncaughtException", (err) => {
    reporter.capture(err, { kind: "uncaughtException" });
    void reporter
      .close()
      .then(exit)
      .finally(() => setTimeout(() => process.exit(1), 5_000).unref());
  });
}
