import { z } from "zod";

export const errorCodes = {
  bad_request: 400,
  invalid_api_key: 401,
  insufficient_credits: 402,
  forbidden: 403,
  not_found: 404,
  blocked_by_robots: 403,
  unsupported_content: 415,
  target_unreachable: 502,
  target_blocked: 502,
  target_timeout: 504,
  llm_not_configured: 400,
  llm_failed: 502,
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
