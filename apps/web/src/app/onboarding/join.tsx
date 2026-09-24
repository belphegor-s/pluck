"use client";

import { useState, useTransition } from "react";
import { acceptInvitationById } from "@/lib/team-actions";

export function JoinInvitation({ id, orgName }: { id: string; orgName: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-1 text-right">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await acceptInvitationById(id);
            if (result?.error) setError(result.error);
          })
        }
        className="bg-[var(--ink)] px-3 py-1.5 text-sm text-[var(--paper)] transition-opacity hover:opacity-85 disabled:opacity-60"
      >
        {pending ? "Joining…" : `Join ${orgName}`}
      </button>
      {error && (
        <p className="text-xs text-[var(--accent)]" role="status">
          {error}
        </p>
      )}
    </div>
  );
}
