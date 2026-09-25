"use client";

import { Loader2, Minus, Plus } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { type AdminState, adjustCreditsAction } from "@/lib/admin/actions";

const empty: AdminState = {};
const PRESETS = [500, 1000, 5000, 25000];

/** Add or remove credits, with a reason that lands in the audit log. */
export function CreditForm({ orgId, balance }: { orgId: string; balance: number }) {
  const [state, action, pending] = useActionState(adjustCreditsAction, empty);
  const [sign, setSign] = useState<1 | -1>(1);
  const [amount, setAmount] = useState("");
  // Controlled: React resets forms after an action, which would lose the
  // reason on a validation error. Cleared only once the change went through.
  const [note, setNote] = useState("");
  useEffect(() => {
    if (!state.ok) return;
    setNote("");
    setAmount("");
  }, [state]);
  const value = Math.trunc(Number(amount) || 0);
  const after = balance + sign * value;

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="orgId" value={orgId} />
      <input type="hidden" name="delta" value={sign * value} />
      <div className="flex border border-[var(--line)] p-0.5 text-sm">
        {([1, -1] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSign(s)}
            className={`flex flex-1 cursor-pointer items-center justify-center gap-1.5 py-2 transition-colors ${
              sign === s
                ? s === 1
                  ? "bg-[var(--ink)] text-[var(--paper)]"
                  : "bg-[var(--accent)] text-white"
                : "text-[var(--ink-soft)] hover:text-[var(--ink)]"
            }`}
          >
            {s === 1 ? <Plus className="size-4" /> : <Minus className="size-4" />}
            {s === 1 ? "Add credits" : "Remove credits"}
          </button>
        ))}
      </div>
      <label className="block">
        <span className="text-sm text-[var(--ink-soft)]">Credits</span>
        <input
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
          placeholder="1000"
          className="mono mt-1.5 w-full border border-[var(--line)] bg-[var(--paper)] px-3 py-2.5 text-lg outline-none focus:border-[var(--accent)]"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setAmount(String(p))}
            className="mono cursor-pointer border border-[var(--line)] px-2.5 py-1 text-sm hover:border-[var(--ink-faint)]"
          >
            {p.toLocaleString("en-US")}
          </button>
        ))}
      </div>
      <label className="block">
        <span className="text-sm text-[var(--ink-soft)]">Reason (goes in the audit log)</span>
        <input
          name="note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          required
          minLength={3}
          maxLength={200}
          placeholder="Refund for failed crawl, goodwill, promotion…"
          className="mt-1.5 w-full border border-[var(--line)] bg-[var(--paper)] px-3 py-2.5 outline-none focus:border-[var(--accent)]"
        />
      </label>
      {value > 0 && (
        <p className="text-sm text-[var(--ink-soft)]">
          Balance goes from{" "}
          <span className="tabular-nums text-[var(--ink)]">{balance.toLocaleString("en-US")}</span>{" "}
          to{" "}
          <span
            className={`tabular-nums ${after < 0 ? "text-[var(--accent)]" : "text-[var(--ink)]"}`}
          >
            {after.toLocaleString("en-US")}
          </span>
          .
        </p>
      )}
      <button
        type="submit"
        disabled={pending || value === 0}
        className="flex w-full cursor-pointer items-center justify-center gap-2 bg-[var(--ink)] px-4 py-2.5 text-[var(--paper)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending && <Loader2 className="size-4 animate-spin" />}
        {sign === 1 ? "Add" : "Remove"} {value ? value.toLocaleString("en-US") : ""} credits
      </button>
      {(state.ok || state.error) && (
        <p
          role="status"
          className={`text-sm ${state.error ? "text-[var(--accent)]" : "text-[var(--leaf)]"}`}
        >
          {state.error ?? state.ok}
        </p>
      )}
    </form>
  );
}
