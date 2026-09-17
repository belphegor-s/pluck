import { z } from "zod";

export const httpUrl = z
  .url({ protocol: /^https?$/ })
  .max(4096)
  .meta({ description: "Absolute http(s) URL.", example: "https://example.com" });

/** Accepts bare domains ("stripe.com") as well as URLs, normalised to a hostname. */
export const domain = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(253)
  .transform((v) => v.replace(/^https?:\/\//, "").replace(/[/?#].*$/, "").replace(/^www\./, ""))
  .pipe(z.string().regex(z.regexes.domain, "Invalid domain"))
  .meta({ description: "Domain name, e.g. stripe.com", example: "stripe.com" });

export const proxyMode = z
  .enum(["auto", "none", "datacenter", "residential"])
  .default("auto")
  .meta({
    description:
      "Egress strategy. `auto` goes direct and escalates through datacenter then residential proxies when a request is blocked.",
  });

export const renderMode = z
  .enum(["auto", "always", "never"])
  .default("auto")
  .meta({
    description:
      "Headless browser usage. `auto` fetches over HTTP first and only renders when the page needs JavaScript.",
  });

export const llmOverride = z
  .object({
    provider: z
      .enum(["openrouter", "openai", "anthropic", "google", "groq", "openai-compatible"])
      .optional(),
    model: z.string().max(200).optional(),
  })
  .optional()
  .meta({
    description:
      "Pick the model used for AI steps. Supply your own key via the `x-llm-key` header to pay the provider directly.",
  });

export const responseMeta = z.object({
  requestId: z.string(),
  creditsUsed: z.number().int().nonnegative(),
  cached: z.boolean(),
  durationMs: z.number().int().nonnegative(),
});
export type ResponseMeta = z.infer<typeof responseMeta>;

export const envelope = <T extends z.ZodType>(data: T) => z.object({ data, meta: responseMeta });

export const cursorQuery = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const pageInfo = z.object({ nextCursor: z.string().nullable() });
