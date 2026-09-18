import { afterEach, describe, expect, it, vi } from "vitest";
import { createErrorReporter } from "./observability.js";

const config = {
  SENTRY_DSN: "https://abc123@errors.example.com/7",
  SENTRY_ENVIRONMENT: "test",
  NODE_ENV: "test" as const,
  ALERT_WEBHOOK_URL: undefined,
};

const log = {
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
} as unknown as Parameters<typeof createErrorReporter>[2];

/** Collects what the reporter would have posted, without any network. */
function outbox(reporter: ReturnType<typeof createErrorReporter>) {
  const payloads: string[] = [];
  Reflect.set(reporter, "send", (_url: string, body: string) => payloads.push(body));
  return payloads;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("error reporter", () => {
  it("does nothing but log without a DSN", async () => {
    const reporter = createErrorReporter({ ...config, SENTRY_DSN: undefined }, "api", log);
    const payloads = outbox(reporter);
    reporter.capture(new Error("boom"));
    await reporter.close();
    expect(payloads).toHaveLength(0);
  });

  it("builds an envelope the ingest endpoint accepts", () => {
    const reporter = createErrorReporter(config, "api", log);
    const payloads = outbox(reporter);

    reporter.capture(new Error("boom"), { endpoint: "scrape", requestId: "req_1" });

    const [header, itemHeader, event] = payloads[0]!.split("\n").map((l) => JSON.parse(l));
    expect(header.dsn).toBe("https://abc123@errors.example.com/7");
    expect(itemHeader).toEqual({ type: "event", content_type: "application/json" });
    expect(event.exception.values[0]).toMatchObject({ type: "Error", value: "boom" });
    expect(event.tags).toMatchObject({ service: "api", endpoint: "scrape" });
    expect(event.environment).toBe("test");
    // Frames run oldest first, and our own code is flagged as in-app.
    const frames = event.exception.values[0].stacktrace.frames;
    expect(frames.length).toBeGreaterThan(0);
    expect(frames.at(-1).filename).toContain("observability.test");
  });

  it("reports one event per fingerprint inside the dedupe window", () => {
    const reporter = createErrorReporter(config, "api", log);
    const payloads = outbox(reporter);

    for (let i = 0; i < 5; i++) reporter.capture(new Error("same"), { endpoint: "scrape" });
    reporter.capture(new Error("different"), { endpoint: "scrape" });

    expect(payloads).toHaveLength(2);
  });
});
