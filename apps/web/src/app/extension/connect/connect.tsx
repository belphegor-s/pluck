"use client";

import { EXTENSION_MESSAGE, extensionKeyName } from "@pluck/shared";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { authorizeExtension } from "@/lib/extension-actions";
import { formatNumber } from "@/lib/format";

interface ExtensionRuntime {
  sendMessage: (id: string, message: unknown, callback: (response: unknown) => void) => void;
  lastError?: { message?: string };
}

/** Present only when an installed extension lists this site as connectable. */
const extensionRuntime = (): ExtensionRuntime | null =>
  (globalThis as { chrome?: { runtime?: ExtensionRuntime } }).chrome?.runtime ?? null;

function send(ext: string, message: unknown, timeoutMs: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const runtime = extensionRuntime();
    if (!runtime?.sendMessage) {
      reject(new Error("unreachable"));
      return;
    }
    const timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
    try {
      runtime.sendMessage(ext, message, (response) => {
        clearTimeout(timer);
        if (extensionRuntime()?.lastError) reject(new Error("unreachable"));
        else resolve(response);
      });
    } catch {
      clearTimeout(timer);
      reject(new Error("unreachable"));
    }
  });
}

export interface ConnectWorkspace {
  id: string;
  name: string;
  credits: number;
}

export function ConnectExtension({
  ext,
  challenge,
  state,
  device,
  workspaces,
  initial,
}: {
  ext: string;
  challenge: string;
  state: string;
  device?: string;
  workspaces: ConnectWorkspace[];
  initial: string;
}) {
  const [orgId, setOrgId] = useState(initial);
  const [reachable, setReachable] = useState<boolean | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const workspace = workspaces.find((w) => w.id === orgId) ?? workspaces[0]!;

  // A code is worthless if nothing can receive it, so find out first.
  useEffect(() => {
    let live = true;
    send(ext, { type: EXTENSION_MESSAGE.ping }, 3000)
      .then(() => live && setReachable(true))
      .catch(() => live && setReachable(false));
    return () => {
      live = false;
    };
  }, [ext]);

  if (done)
    return (
      <div className="space-y-2" role="status">
        <p className="text-[var(--leaf)]">Connected to {workspace.name}.</p>
        <p>Head back to the extension: this tab closes by itself in a moment.</p>
      </div>
    );

  if (reachable === false)
    return (
      <div className="space-y-3">
        <p className="text-[var(--accent)]" role="status">
          The extension did not answer.
        </p>
        <p>
          Make sure it is installed and enabled in this browser profile, then start again from the
          extension by choosing Connect. If you just installed or updated it, reload this page.
        </p>
        <Link href="/extension" className="text-[var(--accent)] underline underline-offset-4">
          About the extension
        </Link>
      </div>
    );

  const connect = () =>
    start(async () => {
      setError(null);
      const result = await authorizeExtension({ ext, challenge, state, device, orgId });
      if (!result.code) {
        setError(result.error ?? "Something went wrong. Try again.");
        return;
      }
      try {
        const reply = (await send(
          ext,
          { type: EXTENSION_MESSAGE.connect, code: result.code, state },
          20_000,
        )) as { ok?: boolean; error?: string } | undefined;
        if (reply?.ok) setDone(true);
        else setError(reply?.error ?? "The extension could not finish signing in. Try again.");
      } catch {
        setError("The extension stopped answering. Open it and choose Connect again.");
      }
    });

  return (
    <div className="space-y-5">
      {workspaces.length > 1 && (
        <fieldset className="space-y-2">
          <legend className="mb-2 text-[var(--ink)]">Which workspace should it use?</legend>
          {workspaces.map((w) => (
            <label
              key={w.id}
              className={`flex items-center gap-3 border px-3 py-2.5 ${
                w.id === orgId ? "border-[var(--ink)] bg-[var(--paper)]" : "border-[var(--line)]"
              }`}
            >
              <input
                type="radio"
                name="workspace"
                value={w.id}
                checked={w.id === orgId}
                onChange={() => setOrgId(w.id)}
                className="accent-[var(--accent)]"
              />
              <span className="min-w-0 flex-1 truncate text-[var(--ink)]">{w.name}</span>
              <span className="mono text-xs text-[var(--ink-faint)]">
                {formatNumber(w.credits)} credits
              </span>
            </label>
          ))}
        </fieldset>
      )}

      <ul className="space-y-2">
        <li>
          A new API key named <span className="text-[var(--ink)]">{extensionKeyName(device)}</span>{" "}
          is created in <span className="text-[var(--ink)]">{workspace.name}</span> and stored in
          this browser.
        </li>
        <li>
          What you pluck with the extension runs through that key, on the workspace's credits.
        </li>
        <li>
          Signing out of the extension revokes the key. So does{" "}
          <Link
            href="/dashboard/keys"
            className="text-[var(--accent)] underline underline-offset-4"
          >
            API keys
          </Link>{" "}
          in the dashboard.
        </li>
      </ul>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          type="button"
          disabled={pending || reachable === null}
          onClick={connect}
          className="bg-[var(--ink)] px-5 py-3 text-[var(--paper)] transition-opacity hover:opacity-85 disabled:opacity-60 sm:py-2.5"
        >
          {pending ? "Connecting…" : `Connect ${workspace.name}`}
        </button>
        <Link href="/" className="btn-outline px-5 py-3 text-center sm:py-2.5">
          Cancel
        </Link>
      </div>
      {error && (
        <p className="text-[var(--accent)]" role="status">
          {error}
        </p>
      )}
    </div>
  );
}
