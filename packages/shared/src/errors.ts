import { z } from "zod";

/**
 * Failures caused by a third party — the page we were asked to read, or the
 * model provider — answer 424 Failed Dependency rather than 502/504. A CDN in
 * front of the API replaces gateway statuses with its own error page, which
 * would hide the `code` and `message` the caller needs.
 */
export const errorCodes = {
  bad_request: 400,
  invalid_api_key: 401,
  insufficient_credits: 402,
  forbidden: 403,
  not_found: 404,
  blocked_by_robots: 403,
  unsupported_content: 415,
  target_unreachable: 424,
  target_blocked: 424,
  target_timeout: 424,
  llm_not_configured: 400,
  llm_failed: 424,
  rate_limited: 429,
  internal: 500,
} as const;

export type ErrorCode = keyof typeof errorCodes;

export const errorBody = z
  .object({
    error: z.object({
      code: z.enum(Object.keys(errorCodes) as [ErrorCode, ...ErrorCode[]]),
      message: z.string(),
      requestId: z.string().optional(),
      details: z.unknown().optional(),
    }),
  })
  .meta({ id: "Error" });
export type ErrorBody = z.infer<typeof errorBody>;

export class PluckError extends Error {
  readonly status: number;

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "PluckError";
    this.status = errorCodes[code];
  }
}

export const isPluckError = (e: unknown): e is PluckError =>
  e instanceof Error && e.name === "PluckError" && "code" in e;
