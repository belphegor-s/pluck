"use client";

import { DEFAULT_MODELS, PROVIDER_LABELS, type PROVIDERS } from "@pluck/ai";
import { useActionState, useState } from "react";
import { ProviderSelect } from "@/components/provider-select";
import {
  type ActionState,
  createApiKey,
  deleteLlmKey,
  revokeApiKey,
  saveLlmKey,
} from "@/lib/actions";

const empty: ActionState = {};

function Notice({ state }: { state: ActionState }) {
  if (!state.ok && !state.error) return null;
  return (
    <p
      className={`mt-3 text-sm ${state.error ? "text-[var(--accent)]" : "text-[var(--leaf)]"}`}
      role="status"
    >
      {state.error ?? state.ok}
    </p>
  );
}

export function CreateKeyForm() {
  const [state, action, pending] = useActionState(createApiKey, empty);
  const [copied, setCopied] = useState(false);

  return (
    <div>
      <form action={action} className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="block text-[var(--ink-soft)]">Name</span>
          <input
            name="name"
            defaultValue="Production"
            maxLength={60}
            className="mt-1 w-56 border border-[var(--line)] bg-[var(--sheet)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="bg-[var(--ink)] px-4 py-2 text-sm text-[var(--paper)] disabled:opacity-60"
        >
          {pending ? "Creating…" : "Create key"}
        </button>
      </form>
      <Notice state={state} />
      {state.secret && (
        <div className="sheet mt-3 flex flex-wrap items-center gap-3 p-3">
          <code className="mono flex-1 break-all text-sm">{state.secret}</code>
          <button
            type="button"
            className="border border-[var(--line)] px-3 py-1.5 text-xs"
            onClick={() => {
              void navigator.clipboard.writeText(state.secret!);
              setCopied(true);
            }}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}
    </div>
  );
}

export function RevokeKeyButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState(revokeApiKey, empty);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        className="text-xs text-[var(--ink-faint)] underline underline-offset-4 hover:text-[var(--accent)]"
      >
        {pending ? "Revoking…" : "Revoke"}
      </button>
      {state.error && <span className="ml-2 text-xs text-[var(--accent)]">{state.error}</span>}
    </form>
  );
}

export function ProviderForm({
  saved,
}: {
  saved: { provider: string; keyHint: string; model: string | null; isDefault: boolean }[];
}) {
  const [state, action, pending] = useActionState(saveLlmKey, empty);
  const [provider, setProvider] = useState<(typeof PROVIDERS)[number]>("openrouter");
  const [removeState, removeAction] = useActionState(deleteLlmKey, empty);

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <form action={action} className="space-y-4">
        <div className="block text-sm">
          <span className="block text-[var(--ink-soft)]" id="provider-label">
            Provider
          </span>
          <div className="mt-1">
            <ProviderSelect name="provider" value={provider} onChange={setProvider} />
          </div>
        </div>
        <label className="block text-sm">
          <span className="block text-[var(--ink-soft)]">API key</span>
          <input
            name="apiKey"
            type="password"
            autoComplete="off"
            placeholder={provider === "openai-compatible" ? "optional for local models" : "sk-…"}
            className="mono mt-1 w-full border border-[var(--line)] bg-[var(--sheet)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
        </label>
        <label className="block text-sm">
          <span className="block text-[var(--ink-soft)]">Model</span>
          <input
            name="model"
            placeholder={DEFAULT_MODELS[provider] ?? "llama3.2"}
            className="mono mt-1 w-full border border-[var(--line)] bg-[var(--sheet)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
        </label>
        {provider === "openai-compatible" && (
          <label className="block text-sm">
            <span className="block text-[var(--ink-soft)]">Base URL</span>
            <input
              name="baseUrl"
              placeholder="https://my-vllm.example.com/v1"
              className="mono mt-1 w-full border border-[var(--line)] bg-[var(--sheet)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
            />
          </label>
        )}
        <label className="flex items-center gap-2 text-sm text-[var(--ink-soft)]">
          <input
            type="checkbox"
            name="isDefault"
            defaultChecked
            className="accent-[var(--accent)]"
          />
          Use this provider by default
        </label>
        <button
          type="submit"
          disabled={pending}
          className="bg-[var(--ink)] px-4 py-2 text-sm text-[var(--paper)] disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save provider key"}
        </button>
        <Notice state={state} />
      </form>

      <div>
        <h3 className="text-sm font-semibold">Saved providers</h3>
        {saved.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--ink-soft)]">
            None yet. Without one, AI endpoints use our model and cost 8 credits instead of 1.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {saved.map((row) => (
              <li
                key={row.provider}
                className="sheet flex items-center justify-between gap-3 p-3 text-sm"
              >
                <span>
                  <span className="font-medium">
                    {PROVIDER_LABELS[row.provider as (typeof PROVIDERS)[number]]}
                  </span>
                  <span className="mono ml-2 text-xs text-[var(--ink-faint)]">{row.keyHint}</span>
                  {row.model && (
                    <span className="mono ml-2 text-xs text-[var(--ink-faint)]">{row.model}</span>
                  )}
                  {row.isDefault && (
                    <span className="ml-2 text-xs text-[var(--leaf)]">default</span>
                  )}
                </span>
                <form action={removeAction}>
                  <input type="hidden" name="provider" value={row.provider} />
                  <button
                    type="submit"
                    className="text-xs text-[var(--ink-faint)] underline underline-offset-4 hover:text-[var(--accent)]"
                  >
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <Notice state={removeState} />
      </div>
    </div>
  );
}
