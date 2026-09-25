"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState, useTransition } from "react";

/**
 * A destructive action in two taps: the first arms it (and says what will
 * happen), the second runs it. It disarms itself after a few seconds, so a
 * stray tap later never fires it.
 */
export function ConfirmButton({
  action,
  fields,
  label,
  confirm,
  tone = "bad",
}: {
  action: (form: FormData) => Promise<void>;
  fields: Record<string, string>;
  label: string;
  confirm: string;
  tone?: "bad" | "plain";
}) {
  const [armed, setArmed] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!armed) return setArmed(true);
        const form = new FormData();
        for (const [k, v] of Object.entries(fields)) form.set(k, v);
        start(async () => {
          await action(form);
          setArmed(false);
        });
      }}
      className={`inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap border px-2.5 py-1 text-xs transition-colors disabled:cursor-wait ${
        armed
          ? "border-[var(--accent)] bg-[var(--accent)] text-white"
          : tone === "bad"
            ? "border-[var(--line)] text-[var(--ink-soft)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
            : "border-[var(--line)] text-[var(--ink-soft)] hover:border-[var(--ink-faint)] hover:text-[var(--ink)]"
      }`}
    >
      {pending && <Loader2 className="size-3 animate-spin" />}
      {armed ? confirm : label}
    </button>
  );
}
