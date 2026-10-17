"use client";

import { ArrowUpRight, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { nav, SITE } from "@/lib/site";
import { usePresence } from "@/lib/use-presence";

const links = [
  ...nav,
  { href: "/dashboard", label: "Dashboard" },
  { href: SITE.repo, label: "GitHub", external: true },
] as const;

/**
 * The navigation for narrow screens. A panel rather than a full-screen overlay:
 * the header stays put, so the way out is where the way in was.
 */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const panelId = useId();
  const presence = usePresence(open);

  // Any navigation closes the menu; the pathname is the signal, not a value the
  // effect reads.
  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname is the trigger.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    // A menu that scrolls the page behind it feels broken on a phone. Focus is
    // left where it is: the panel follows the button in the DOM, so Tab already
    // walks into it, and moving focus would ring the first link on every tap.
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((o) => !o)}
        className="-mr-1 flex size-9 items-center justify-center border border-[var(--line)] text-[var(--ink)] transition-colors hover:border-[var(--ink)]"
      >
        {/* The bars turn into the cross and back. */}
        <span className="grid" aria-hidden="true">
          <Menu
            className={`col-start-1 row-start-1 size-[18px] transition duration-300 ${
              open ? "rotate-90 scale-50 opacity-0" : ""
            }`}
          />
          <X
            className={`col-start-1 row-start-1 size-[18px] transition duration-300 ${
              open ? "" : "-rotate-90 scale-50 opacity-0"
            }`}
          />
        </span>
      </button>

      {presence.mounted && (
        <>
          <button
            type="button"
            tabIndex={-1}
            aria-hidden
            onClick={() => setOpen(false)}
            data-state={presence.state}
            className="scrim fixed inset-x-0 bottom-0 top-14 z-40 cursor-default bg-[color-mix(in_srgb,var(--ink)_28%,transparent)]"
          />
          <div
            id={panelId}
            data-state={presence.state}
            inert={!open}
            className="drop fixed inset-x-0 top-14 z-50 max-h-[calc(100dvh-3.5rem)] overflow-y-auto border-b border-[var(--line)] bg-[var(--paper)] px-4 pb-6 pt-2 shadow-lg"
          >
            <nav aria-label="Main">
              <ul className="divide-y divide-[var(--line)]">
                {links.map((item, i) => {
                  const external = "external" in item && item.external;
                  const active = !external && pathname.startsWith(item.href);
                  return (
                    <li
                      key={item.href}
                      className="drop-item"
                      style={{ "--i": i } as React.CSSProperties}
                    >
                      <Link
                        href={item.href}
                        onClick={() => setOpen(false)}
                        aria-current={active ? "page" : undefined}
                        className={`flex items-center justify-between py-3.5 text-base ${
                          active ? "text-[var(--accent)]" : "text-[var(--ink)]"
                        }`}
                        {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
                      >
                        {item.label}
                        {external && (
                          <ArrowUpRight
                            aria-hidden="true"
                            className="size-3.5 text-[var(--ink-faint)]"
                          />
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
            <Link
              href="/dashboard"
              onClick={() => setOpen(false)}
              className="drop-item mt-4 block bg-[var(--ink)] px-4 py-3 text-center text-sm text-[var(--paper)]"
              style={{ "--i": links.length } as React.CSSProperties}
            >
              Get an API key
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
