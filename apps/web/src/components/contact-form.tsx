"use client";

import { useActionState } from "react";
import { type ActionState, submitContact } from "@/lib/actions";

const field =
  "mt-1 w-full border border-[var(--line)] bg-[var(--sheet)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]";

export function ContactForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(submitContact, {});

  if (state.ok) {
    return (
      <div className="sheet p-6">
        <h2 className="text-lg">Message sent</h2>
        <p className="mt-2 text-sm text-[var(--ink-soft)]">{state.ok}</p>
      </div>
    );
  }

  return (
    <form action={action} className="sheet space-y-4 p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-[var(--ink-soft)]">Name</span>
          <input name="name" required maxLength={120} className={field} />
        </label>
        <label className="block text-sm">
          <span className="text-[var(--ink-soft)]">Email</span>
          <input name="email" type="email" required maxLength={320} className={field} />
        </label>
        <label className="block text-sm">
          <span className="text-[var(--ink-soft)]">Company</span>
          <input name="company" maxLength={160} className={field} />
        </label>
        <label className="block text-sm">
          <span className="text-[var(--ink-soft)]">Pages per month</span>
          <input name="volume" placeholder="e.g. 2 million" maxLength={120} className={field} />
        </label>
      </div>
      <label className="block text-sm">
        <span className="text-[var(--ink-soft)]">What are you building?</span>
        <textarea
          name="message"
          required
          rows={6}
          minLength={10}
          maxLength={4000}
          className={field}
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="bg-[var(--ink)] px-5 py-2.5 text-sm text-[var(--paper)] disabled:opacity-60"
      >
        {pending ? "Sending…" : "Send message"}
      </button>
      {state.error && <p className="text-sm text-[var(--accent)]">{state.error}</p>}
    </form>
  );
}
