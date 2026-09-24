"use client";

import { useActionState, useState } from "react";
import { type ActionState, deleteAccount } from "@/lib/actions";

const empty: ActionState = {};

/**
 * Deletes the account after the email is typed back.
 *
 * Collapsed by default so the button is never one stray click from firing.
 */
export function DeleteAccount({ email }: { email: string }) {
  const [state, action, pending] = useActionState(deleteAccount, empty);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const matches = typed.trim().toLowerCase() === email.toLowerCase();

  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="border border-[var(--line)] px-4 py-2 text-sm text-[var(--accent)] transition-colors hover:border-[var(--accent)]"
      >
        Delete account…
      </button>
    );

  return (
    <form action={action} className="sheet space-y-4 border-[var(--accent)] p-4">
      <p className="text-sm text-[var(--ink-soft)]">
        This removes your account and every workspace you are the only member of, with their keys,
        usage history, monitors, crawls, webhook log and remaining credits. It cannot be undone.
        Invoices stay with the payment provider, which is required to keep them.
      </p>
      <label className="block text-sm">
        <span className="block text-[var(--ink-soft)]">
          Type <span className="mono text-[var(--ink)]">{email}</span> to confirm
        </span>
        <input
          name="confirm"
          autoComplete="off"
          spellCheck={false}
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          className="mono mt-1 w-full border border-[var(--line)] bg-[var(--sheet)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
        />
      </label>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          type="submit"
          disabled={!matches || pending}
          className="bg-[var(--accent)] px-4 py-2.5 text-sm text-white disabled:opacity-50 sm:py-2"
        >
          {pending ? "Deleting…" : "Delete my account"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setTyped("");
          }}
          className="text-sm text-[var(--ink-soft)] underline underline-offset-4 hover:text-[var(--ink)]"
        >
          Cancel
        </button>
        {state.error && (
          <p className="text-sm text-[var(--accent)]" role="status">
            {state.error}
          </p>
        )}
      </div>
    </form>
  );
}
