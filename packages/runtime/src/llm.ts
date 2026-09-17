import {
  isProviderId,
  type LlmCredential,
  LlmTasks,
  type ProviderId,
  type ResolvedLlm,
  SecretBox,
} from "@pluck/ai";
import { assertPublicUrl, type LlmSelection } from "@pluck/core";
import { type Database, llmCredentials } from "@pluck/db";
import { PluckError } from "@pluck/shared";
import { eq } from "drizzle-orm";
import type { Config } from "./config.js";

export interface LlmHeaders {
  provider?: string | null;
  key?: string | null;
  model?: string | null;
  baseUrl?: string | null;
}

/**
 * Chooses whose key pays for an LLM call:
 *   1. `x-llm-*` request headers (never stored)
 *   2. the account's saved provider key (explicit provider, then default)
 *   3. the instance key configured by the operator
 */
export class LlmResolver {
  readonly box: SecretBox;

  constructor(
    private readonly db: Database,
    private readonly config: Config,
    private readonly instance: LlmCredential | null,
  ) {
    this.box = new SecretBox(config.PLUCK_ENCRYPTION_KEY);
  }

  get hasInstanceKey(): boolean {
    return this.instance !== null;
  }

  tasks(userId: string | null, headers: LlmHeaders = {}): LlmTasks {
    let saved: Promise<(typeof llmCredentials.$inferSelect)[]> | null = null;
    const loadSaved = () => {
      if (!userId) return Promise.resolve([]);
      saved ??= this.db.select().from(llmCredentials).where(eq(llmCredentials.userId, userId));
      return saved;
    };

    const resolve = async (selection?: LlmSelection): Promise<ResolvedLlm> => {
      if (headers.key) {
        const provider = headers.provider ?? selection?.provider ?? "openrouter";
        if (!isProviderId(provider))
          throw new PluckError("bad_request", `Unknown LLM provider "${provider}".`);
        return {
          credential: this.checked({
            provider,
            apiKey: headers.key,
            model: headers.model ?? selection?.model,
            baseUrl: headers.baseUrl,
          }),
          billing: "byok",
        };
      }

      const rows = await loadSaved();
      const wanted = selection?.provider;
      const row = wanted
        ? rows.find((r) => r.provider === wanted)
        : (rows.find((r) => r.isDefault) ?? rows[0]);
      if (row) {
        return {
          credential: this.checked({
            provider: row.provider as ProviderId,
            apiKey: this.box.open(row.encryptedKey),
            model: selection?.model ?? row.model,
            baseUrl: row.baseUrl,
          }),
          billing: "byok",
        };
      }

      if (
        this.instance &&
        (!wanted || wanted === this.instance.provider || this.instance.provider === "openrouter")
      ) {
        return {
          credential: { ...this.instance, model: selection?.model ?? this.instance.model },
          billing: "instance",
        };
      }

      throw new PluckError(
        "llm_not_configured",
        wanted
          ? `No ${wanted} key is configured. Add one in the dashboard or send it in the x-llm-key header.`
          : "No LLM is configured. Add a provider key in the dashboard or send x-llm-provider and x-llm-key headers.",
      );
    };

    return new LlmTasks(resolve, {
      maxInputChars: this.config.LLM_MAX_INPUT_CHARS,
      timeoutMs: this.config.LLM_TIMEOUT_MS,
      maxOutputTokens: this.config.LLM_MAX_OUTPUT_TOKENS,
    });
  }

  /** User-supplied base URLs must not point into our private network. */
  private checked(cred: LlmCredential): LlmCredential {
    if (cred.baseUrl) assertPublicUrl(cred.baseUrl, this.config.ALLOW_PRIVATE_NETWORK);
    return cred;
  }
}
