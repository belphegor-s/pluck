"use client";

import { useActionState, useState } from "react";
import {
  type ActionState,
  redeliverWebhook,
  rotateWebhookSecret,
  sendTestWebhook,
} from "@/lib/actions";

const empty: ActionState = {};

function Notice({ state }: { state: ActionState }) {
  if (!state.ok && !state.error) return null;
  return (
    <p
      className={`text-sm ${state.error ? "text-[var(--accent)]" : "text-[var(--leaf)]"}`}
      role="status"
    >
      {state.error ?? state.ok}
    </p>
  );
}

export function TestWebhookForm() {
  const [state, action, pending] = useActionState(sendTestWebhook, empty);
  return (
    <form action={action} className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor="test-url">
          Endpoint URL
        </label>
        <input
          id="test-url"
          name="url"
          type="url"
          required
          inputMode="url"
          placeholder="https://you.example.com/hooks/pluck"
          className="mono min-w-0 flex-1 border border-[var(--line)] bg-[var(--sheet)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
        />
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 bg-[var(--ink)] px-4 py-2.5 text-sm text-[var(--paper)] disabled:opacity-60 sm:py-2"
        >
          {pending ? "Sending…" : "Send test event"}
        </button>
      </div>
      <Notice state={state} />
    </form>
  );
}

export function RedeliverButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState(redeliverWebhook, empty);
  return (
    <form action={action} className="flex items-center justify-end gap-2">
      <input type="hidden" name="id" value={id} />
      {state.error && <span className="text-xs text-[var(--accent)]">{state.error}</span>}
      {state.ok && <span className="text-xs text-[var(--leaf)]">{state.ok}</span>}
      <button
        type="submit"
        disabled={pending}
        className="text-xs text-[var(--ink-soft)] underline underline-offset-4 hover:text-[var(--ink)] disabled:opacity-60"
      >
        {pending ? "Queueing…" : "Resend"}
      </button>
    </form>
  );
}

export function SigningSecret({ secret }: { secret: string }) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  const [state, action, pending] = useActionState(rotateWebhookSecret, empty);

  return (
    <div className="space-y-3">
      <div className="sheet flex flex-wrap items-center gap-3 p-3">
        <code className="mono min-w-0 flex-1 break-all text-sm">
          {shown ? secret : `${secret.slice(0, 4)}${"•".repeat(24)}`}
        </code>
        <div className="flex gap-3 text-xs">
          <button
            type="button"
            onClick={() => setShown((s) => !s)}
            className="text-[var(--ink-soft)] underline underline-offset-4 hover:text-[var(--ink)]"
          >
            {shown ? "Hide" : "Reveal"}
          </button>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(secret).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1600);
              });
            }}
            className="text-[var(--ink-soft)] underline underline-offset-4 hover:text-[var(--ink)]"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
      <form
        action={action}
        onSubmit={(event) => {
          if (
            !confirm(
              "Issue a new secret? Receivers still verifying with the old one will reject deliveries until they are updated.",
            )
          )
            event.preventDefault();
        }}
        className="flex flex-wrap items-center gap-3"
      >
        <button
          type="submit"
          disabled={pending}
          className="text-xs text-[var(--ink-faint)] underline underline-offset-4 hover:text-[var(--accent)] disabled:opacity-60"
        >
          {pending ? "Rotating…" : "Rotate secret"}
        </button>
        <Notice state={state} />
      </form>
    </div>
  );
}
