import { z } from "zod";
import { domain, llmOverride, proxyMode } from "./common.js";

export const brandQuery = z
  .object({
    domain: domain.optional(),
    email: z.email().max(320).optional(),
    name: z.string().min(2).max(200).optional(),
    ticker: z.string().min(1).max(12).toUpperCase().optional(),
    maxAge: z.coerce.number().int().min(0).max(2_592_000).default(604_800),
    proxy: proxyMode,
  })
  .refine((v) => [v.domain, v.email, v.name, v.ticker].filter(Boolean).length === 1, {
    message: "Provide exactly one of `domain`, `email`, `name` or `ticker`.",
  })
  .meta({ id: "BrandQuery" });
export type BrandQuery = z.infer<typeof brandQuery>;

export const logoAsset = z.object({
  url: z.string(),
  type: z.enum(["icon", "logo", "symbol", "og", "apple-touch-icon"]),
  format: z.string().nullable(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  theme: z.enum(["light", "dark"]).nullable(),
});

export const industryCode = z.object({ code: z.string(), title: z.string(), confidence: z.number().min(0).max(1) });

export const brand = z
  .object({
    domain: z.string(),
    name: z.string().nullable(),
    title: z.string().nullable(),
    description: z.string().nullable(),
    slogan: z.string().nullable(),
    logos: z.array(logoAsset),
    colors: z.array(z.object({ hex: z.string(), name: z.string().nullable() })),
    fonts: z.array(z.string()),
    socials: z.array(z.object({ network: z.string(), url: z.string() })),
    address: z
      .object({
        street: z.string().nullable(),
        city: z.string().nullable(),
        region: z.string().nullable(),
        postalCode: z.string().nullable(),
        country: z.string().nullable(),
      })
      .nullable(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
    stock: z.object({ ticker: z.string(), exchange: z.string().nullable() }).nullable(),
    industries: z.object({ naics: z.array(industryCode), sic: z.array(industryCode) }).nullable(),
    isNsfw: z.boolean(),
    updatedAt: z.string(),
  })
  .meta({ id: "Brand" });
export type Brand = z.infer<typeof brand>;

export const classifyRequest = z
  .object({
    domain: domain.optional(),
    description: z.string().min(10).max(8000).optional(),
    llm: llmOverride,
  })
  .refine((v) => v.domain || v.description, { message: "Provide `domain` or `description`." })
  .meta({ id: "ClassifyRequest" });
export type ClassifyRequest = z.infer<typeof classifyRequest>;

export const classifyResult = z.object({
  naics: z.array(industryCode),
  sic: z.array(industryCode),
});
export type ClassifyResult = z.infer<typeof classifyResult>;

export const transactionRequest = z
  .object({
    descriptor: z.string().min(2).max(300).meta({ example: "SQ *BLUE BOTTLE COFFE OAKLAND CA" }),
    country: z.string().length(2).toLowerCase().optional(),
    mcc: z.string().regex(/^\d{4}$/).optional(),
    amount: z.number().optional(),
    llm: llmOverride,
  })
  .meta({ id: "TransactionRequest" });
export type TransactionRequest = z.infer<typeof transactionRequest>;

export const transactionResult = z.object({
  merchant: z.string().nullable(),
  domain: z.string().nullable(),
  processor: z.string().nullable(),
  location: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  brand: brand.nullable(),
});
export type TransactionResult = z.infer<typeof transactionResult>;

export const logoQuery = z.object({
  size: z.coerce.number().int().min(16).max(512).default(128),
  format: z.enum(["png", "webp", "svg"]).optional(),
  theme: z.enum(["light", "dark"]).optional(),
  fallback: z.enum(["monogram", "404"]).default("monogram"),
});
