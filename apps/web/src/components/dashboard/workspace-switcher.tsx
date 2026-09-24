"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { Icon } from "@/components/dashboard/icons";
import { switchWorkspace } from "@/lib/team-actions";

export interface ShellWorkspace {
  id: string;
  name: string;
  image: string | null;
  role: "owner" | "admin" | "member";
}

const ROLE = { owner: "Owner", admin: "Admin", member: "Member" } as const;

function Badge({ ws, size = "size-7" }: { ws: ShellWorkspace; size?: string }) {
  if (ws.image)
    return (
      // A small uploaded picture, already sized; not worth the image optimiser.
      // biome-ignore lint/performance/noImgElement: see above.
      <img
        src={ws.image}
        alt=""
        aria-hidden="true"
        className={`${size} shrink-0 rounded-[22%] border border-[var(--line)] object-cover`}
      />
    );
  return (
    <span
      aria-hidden="true"
      className={`flex ${size} shrink-0 items-center justify-center rounded-[22%] bg-[var(--ink)] text-xs font-semibold text-[var(--paper)]`}
    >
      {ws.name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

/**
 * Picks the workspace the dashboard shows. Switching only sets a cookie the
 * server checks against membership, then re-renders; nothing is trusted from
 * the list here.
 */
export function WorkspaceSwitcher({
  current,
  workspaces,
  collapsed,
}: {
  current: ShellWorkspace;
  workspaces: ShellWorkspace[];
  collapsed: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const root = useRef<HTMLDivElement | null>(null);
  const listId = useId();
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pick = (id: string) => {
    if (id === current.id) return setOpen(false);
    setError(null);
    start(async () => {
      const result = await switchWorkspace(id);
      if (result.error) return setError(result.error);
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <div ref={root} className="relative px-3 pt-3">
      {/* On the 64px rail the button is exactly the badge plus its padding,
          so the badge stays on the centre line while the sidebar folds. */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={`Workspace: ${current.name}. Switch workspace`}
        title={collapsed ? current.name : undefined}
        className={`flex w-full items-center gap-2.5 overflow-hidden border border-[var(--line)] bg-[var(--paper)] px-[5px] py-1.5 text-left transition-colors hover:border-[var(--ink-faint)] ${
          pending ? "opacity-60" : ""
        }`}
      >
        <Badge ws={current} />
        <span
          aria-hidden="true"
          className={`flex min-w-0 flex-1 items-center gap-2.5 whitespace-nowrap transition-opacity motion-reduce:transition-none ${
            collapsed ? "opacity-0 duration-100" : "opacity-100 delay-100 duration-300"
          }`}
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm">{current.name}</span>
            <span className="block text-[11px] text-[var(--ink-faint)]">{ROLE[current.role]}</span>
          </span>
          <Icon name="chevrons" className="size-4 shrink-0 text-[var(--ink-faint)]" />
        </span>
      </button>

      {open && (
        <div
          className={`sheet absolute z-50 mt-1 w-64 p-1 shadow-lg ${collapsed ? "left-full top-0 ml-2" : "left-3 right-3 w-auto"}`}
        >
          <p className="mono px-2 pb-1 pt-1.5 text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
            Workspaces
          </p>
          <div
            id={listId}
            role="listbox"
            aria-label="Workspaces"
            className="max-h-72 overflow-y-auto"
          >
            {workspaces.map((ws) => {
              const active = ws.id === current.id;
              return (
                <button
                  key={ws.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  disabled={pending}
                  onClick={() => pick(ws.id)}
                  className="flex w-full items-center gap-2.5 px-2 py-2 text-left text-sm transition-colors hover:bg-[var(--accent-wash)]"
                >
                  <Badge ws={ws} size="size-6" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{ws.name}</span>
                    <span className="block text-[11px] text-[var(--ink-faint)]">
                      {ROLE[ws.role]}
                    </span>
                  </span>
                  {active && <Icon name="check" className="size-4 text-[var(--accent)]" />}
                </button>
              );
            })}
          </div>
          <div className="mt-1 border-t border-[var(--line)] pt-1">
            <Link
              href="/dashboard/workspaces/new"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-2 py-2 text-sm text-[var(--ink-soft)] transition-colors hover:bg-[var(--accent-wash)] hover:text-[var(--ink)]"
            >
              <span className="flex size-6 items-center justify-center border border-dashed border-[var(--line)]">
                <Icon name="plus" className="size-3.5" />
              </span>
              Create a workspace
            </Link>
          </div>
          {error && (
            <p className="px-2 pb-1 text-xs text-[var(--accent)]" role="status">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
