"use client";

import { useActionState } from "react";
import { type ProfileState, updateName } from "@/lib/profile-actions";

const empty: ProfileState = {};

export function NameForm({ name }: { name: string }) {
  const [state, action, pending] = useActionState(updateName, empty);
  return (
    <form action={action} className="max-w-md space-y-3">
      <label className="block text-sm">
        <span className="block text-[var(--ink-soft)]">Name</span>
        <input
          name="name"
          required
          maxLength={80}
          defaultValue={name}
          autoComplete="name"
          className="mt-1 w-full border border-[var(--line)] bg-[var(--sheet)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
        />
        <span className="mt-1 block text-xs text-[var(--ink-faint)]">
          Shown to people in your workspaces and on keys you create.
        </span>
      </label>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          type="submit"
          disabled={pending}
          className="bg-[var(--ink)] px-4 py-2.5 text-sm text-[var(--paper)] disabled:opacity-60 sm:py-2"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        {(state.ok || state.error) && (
          <p
            className={`text-sm ${state.error ? "text-[var(--accent)]" : "text-[var(--leaf)]"}`}
            role="status"
          >
            {state.error ?? state.ok}
          </p>
        )}
      </div>
    </form>
  );
}
