"use client";

import { creditPacks } from "@pluck/shared";
import { useState } from "react";
import { formatNumber } from "@/lib/format";

export function BuyCredits() {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function buy(packId: string) {
    setPending(packId);
    setError(null);
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ packId }),
    }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { url?: string; error?: string } | null;
    if (body?.url) {
      window.location.href = body.url;
      return;
    }
    setPending(null);
    setError(body?.error ?? "Checkout is unavailable right now.");
  }

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {creditPacks.map((pack) => (
          <button
            key={pack.id}
            type="button"
            onClick={() => void buy(pack.id)}
            disabled={pending !== null}
            className="sheet p-4 text-left transition-colors hover:border-[var(--accent)] disabled:opacity-60"
          >
            <p className="mono text-xl">{formatNumber(pack.credits)}</p>
            <p className="text-sm text-[var(--ink-soft)]">credits</p>
            <p className="mono mt-3 text-sm">${pack.priceUsd}</p>
            {"bonus" in pack && <p className="mt-1 text-xs text-[var(--leaf)]">{pack.bonus}</p>}
            <p className="mt-3 text-xs text-[var(--accent)]">
              {pending === pack.id ? "Opening checkout…" : "Buy"}
            </p>
          </button>
        ))}
      </div>
      {error && <p className="mt-3 text-sm text-[var(--accent)]">{error}</p>}
    </div>
  );
}
