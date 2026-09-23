"use client";

import { useState, useTransition } from "react";
import { acceptInvitation } from "@/lib/team-actions";

/**
 * Joining is a button press, not the link itself: mail scanners and link
 * previews open links, and opening one must never add anyone to a workspace.
 */
export function AcceptInvitation({ token, orgName }: { token: string; orgName: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await acceptInvitation(token);
            if (result?.error) setError(result.error);
          })
        }
        className="w-full bg-[var(--ink)] px-5 py-3 text-[var(--paper)] transition-opacity hover:opacity-85 disabled:opacity-60 sm:w-auto sm:py-2.5"
      >
        {pending ? "Joining…" : `Join ${orgName}`}
      </button>
      {error && (
        <p className="text-sm text-[var(--accent)]" role="status">
          {error}
        </p>
      )}
    </div>
  );
}
