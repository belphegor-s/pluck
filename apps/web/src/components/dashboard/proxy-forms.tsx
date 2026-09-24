"use client";

import { useActionState, useState } from "react";
import { type ActionState, addProxy, deleteProxy, setProxyActive, testProxy } from "@/lib/actions";

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

const TIERS = [
  {
    id: "datacenter",
    label: "Datacenter",
    note: "Cheap and fast. Fine until a site starts blocking.",
  },
  {
    id: "residential",
    label: "Residential",
    note: "Costs more, gets through more. Used last in auto mode.",
  },
] as const;

export function AddProxyForm() {
  const [state, action, pending] = useActionState(addProxy, empty);
  const [tier, setTier] = useState<"datacenter" | "residential">("datacenter");

  return (
    <form action={action} className="space-y-4">
      <label className="block text-sm">
        <span className="block text-[var(--ink-soft)]">Name</span>
        <input
          name="label"
          defaultValue="My proxy"
          maxLength={60}
          className="mt-1 w-full border border-[var(--line)] bg-[var(--sheet)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
        />
      </label>

      <fieldset>
        <legend className="text-sm text-[var(--ink-soft)]">Tier</legend>
        <div className="mt-1 grid gap-2 sm:grid-cols-2">
          {TIERS.map((option) => (
            <label
              key={option.id}
              className={`sheet cursor-pointer p-3 text-sm transition-colors ${
                tier === option.id ? "border-[var(--accent)]" : "hover:border-[var(--ink-faint)]"
              }`}
            >
              <span className="flex items-center gap-2">
                <input
                  type="radio"
                  name="tier"
                  value={option.id}
                  checked={tier === option.id}
                  onChange={() => setTier(option.id)}
                  className="accent-[var(--accent)]"
                />
                <span className="font-medium">{option.label}</span>
              </span>
              <span className="mt-1 block text-xs text-[var(--ink-faint)]">{option.note}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block text-sm">
        <span className="block text-[var(--ink-soft)]">Proxy URL</span>
        <input
          name="url"
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder="http://user:pass@gateway.provider.io:7777"
          className="mono mt-1 w-full border border-[var(--line)] bg-[var(--sheet)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
        />
        <span className="mt-1 block text-xs text-[var(--ink-faint)]">
          http, https or socks5. <code className="mono">{"{country}"}</code> and{" "}
          <code className="mono">{"{session}"}</code> are replaced per request, for providers that
          use them for geo-targeting and sticky sessions.
        </span>
      </label>

      <button
        type="submit"
        disabled={pending}
        className="bg-[var(--ink)] px-4 py-2.5 text-sm text-[var(--paper)] disabled:opacity-60 sm:py-2"
      >
        {pending ? "Saving…" : "Add proxy"}
      </button>
      <Notice state={state} />
    </form>
  );
}

export function ProxyRowActions({ id, active }: { id: string; active: boolean }) {
  const [testState, test, testing] = useActionState(testProxy, empty);
  const [toggleState, toggle] = useActionState(setProxyActive, empty);
  const [removeState, remove] = useActionState(deleteProxy, empty);
  const message = testState.error ?? testState.ok ?? toggleState.error ?? removeState.error;

  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      {message && (
        <span
          className={`text-xs ${testState.ok ? "text-[var(--leaf)]" : "text-[var(--accent)]"}`}
          role="status"
        >
          {message}
        </span>
      )}
      <form action={test}>
        <input type="hidden" name="id" value={id} />
        <button
          type="submit"
          disabled={testing}
          className="text-xs text-[var(--ink-soft)] underline underline-offset-4 hover:text-[var(--ink)] disabled:opacity-60"
        >
          {testing ? "Testing…" : "Test"}
        </button>
      </form>
      <form action={toggle}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="active" value={String(!active)} />
        <button
          type="submit"
          className="text-xs text-[var(--ink-soft)] underline underline-offset-4 hover:text-[var(--ink)]"
        >
          {active ? "Pause" : "Enable"}
        </button>
      </form>
      <form action={remove}>
        <input type="hidden" name="id" value={id} />
        <button
          type="submit"
          className="text-xs text-[var(--ink-faint)] underline underline-offset-4 hover:text-[var(--accent)]"
        >
          Remove
        </button>
      </form>
    </div>
  );
}
