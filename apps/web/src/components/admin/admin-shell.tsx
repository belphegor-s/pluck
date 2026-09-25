"use client";

import { Building2, Database, LayoutDashboard, LogOut, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "@/components/logo";
import { ThemeToggle } from "@/components/theme";
import { signOutAction } from "@/lib/admin/actions";

const NAV = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/workspaces", label: "Workspaces", icon: Building2 },
  { href: "/admin/sql", label: "SQL", icon: Database },
  { href: "/admin/security", label: "Security", icon: ShieldCheck },
];

const active = (pathname: string, href: string) =>
  href === "/admin" ? pathname === href : pathname.startsWith(href);

export function AdminShell({ children, ip }: { children: React.ReactNode; ip: string | null }) {
  const pathname = usePathname();

  return (
    <div className="min-h-dvh bg-[var(--paper)]">
      <header className="sticky top-0 z-40 border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--paper)_88%,transparent)] backdrop-blur">
        <div className="flex h-14 items-center gap-3 px-4 lg:px-8">
          <Link
            href="/admin"
            className="flex shrink-0 items-center gap-2.5"
            aria-label="Admin overview"
          >
            <Wordmark />
            <span className="mono bg-[var(--accent)] px-1.5 py-0.5 text-[11px] uppercase tracking-wider text-white">
              Admin
            </span>
          </Link>
          <nav aria-label="Admin" className="ml-4 hidden items-center gap-1 md:flex">
            {NAV.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                aria-current={active(pathname, href) ? "page" : undefined}
                className={`flex items-center gap-2 px-3 py-1.5 text-sm transition-colors ${
                  active(pathname, href)
                    ? "bg-[var(--accent-wash)] text-[var(--ink)]"
                    : "text-[var(--ink-soft)] hover:bg-[var(--sheet)] hover:text-[var(--ink)]"
                }`}
              >
                <Icon
                  className={`size-4 ${active(pathname, href) ? "text-[var(--accent)]" : ""}`}
                />
                {label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {ip && (
              <span
                className="mono hidden text-xs text-[var(--ink-faint)] lg:inline"
                title="Signed in from"
              >
                {ip}
              </span>
            )}
            <ThemeToggle />
            <form action={signOutAction}>
              <button
                type="submit"
                title="Sign out"
                aria-label="Sign out"
                className="flex size-9 cursor-pointer items-center justify-center border border-[var(--line)] text-[var(--ink-soft)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
              >
                <LogOut className="size-4" />
              </button>
            </form>
          </div>
        </div>
        {/* Phones: the same tabs as a scrolling row under the bar. */}
        <nav
          aria-label="Admin"
          className="flex gap-1 overflow-x-auto border-t border-[var(--line)] px-2 py-1.5 [scrollbar-width:none] md:hidden"
        >
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={active(pathname, href) ? "page" : undefined}
              className={`flex shrink-0 items-center gap-1.5 px-3 py-1.5 text-sm ${
                active(pathname, href)
                  ? "bg-[var(--accent-wash)] text-[var(--ink)]"
                  : "text-[var(--ink-soft)]"
              }`}
            >
              <Icon className={`size-4 ${active(pathname, href) ? "text-[var(--accent)]" : ""}`} />
              {label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="px-4 pb-16 pt-6 lg:px-8 lg:pt-8">{children}</main>
    </div>
  );
}
