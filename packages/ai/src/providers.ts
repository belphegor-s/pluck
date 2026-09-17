import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogle } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { PluckError } from "@pluck/shared";
import type { LanguageModel } from "ai";

export const PROVIDERS = ["openrouter", "openai", "anthropic", "google", "groq", "openai-compatible"] as const;
export type ProviderId = (typeof PROVIDERS)[number];

export const isProviderId = (v: unknown): v is ProviderId => PROVIDERS.includes(v as ProviderId);

/**
 * Sensible fast/cheap defaults per provider for extraction workloads.
 * Every one is overridable per request (`llm.model`) or per instance (env).
 */
export const DEFAULT_MODELS: Record<ProviderId, string | null> = {
  openrouter: "google/gemini-3.8-flash",
  openai: "gpt-5.6-luna",
  anthropic: "claude-haiku-4-5",
  google: "gemini-3.8-flash",
  groq: "openai/gpt-oss-120b",
  "openai-compatible": null,
};

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  openrouter: "OpenRouter",
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google Gemini",
  groq: "Groq",
  "openai-compatible": "OpenAI-compatible (Ollama, vLLM, LM Studio, Together...)",
};

export interface LlmCredential {
  provider: ProviderId;
  apiKey: string;
  model?: string | null;
  baseUrl?: string | null;
}

export function createModel(cred: LlmCredential, modelOverride?: string | null): { model: LanguageModel; modelId: string } {
  const modelId = modelOverride || cred.model || DEFAULT_MODELS[cred.provider];
  if (!modelId) {
    throw new PluckError("bad_request", `A model name is required for the ${PROVIDER_LABELS[cred.provider]} provider.`);
  }
  const baseURL = cred.baseUrl || undefined;

  switch (cred.provider) {
    case "openrouter":
      return {
        modelId,
        model: createOpenRouter({ apiKey: cred.apiKey, baseURL, appName: "Pluck", appUrl: "https://pluck.procd.cc", compatibility: "strict" })(modelId),
      };
    case "openai":
      return { modelId, model: createOpenAI({ apiKey: cred.apiKey, baseURL })(modelId) };
    case "anthropic":
      return { modelId, model: createAnthropic({ apiKey: cred.apiKey, baseURL })(modelId) };
    case "google":
      return { modelId, model: createGoogle({ apiKey: cred.apiKey, baseURL })(modelId) };
    case "groq":
      return { modelId, model: createGroq({ apiKey: cred.apiKey, baseURL })(modelId) };
    case "openai-compatible": {
      if (!baseURL) throw new PluckError("bad_request", "`baseUrl` is required for OpenAI-compatible providers.");
      return {
        modelId,
        model: createOpenAICompatible({ name: "custom", apiKey: cred.apiKey, baseURL, supportsStructuredOutputs: true })(modelId),
      };
    }
  }
}

/** Instance-wide default credential from environment variables. */
export function credentialFromEnv(raw: Readonly<Record<string, unknown>>): LlmCredential | null {
  const env = raw as Record<string, string | undefined>;
  const provider = env.PLUCK_LLM_PROVIDER ?? (env.OPENROUTER_API_KEY ? "openrouter" : undefined);
  const apiKey = env.PLUCK_LLM_API_KEY ?? env.OPENROUTER_API_KEY;
  if (!provider || !isProviderId(provider)) return null;
  if (!apiKey && provider !== "openai-compatible") return null;
  return {
    provider,
    apiKey: apiKey ?? "not-needed",
    model: env.PLUCK_LLM_MODEL || null,
    baseUrl: env.PLUCK_LLM_BASE_URL || null,
  };
}
