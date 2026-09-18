"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/keys", label: "API keys" },
  { href: "/dashboard/ai", label: "Model provider" },
  { href: "/dashboard/monitors", label: "Monitors" },
  { href: "/dashboard/billing", label: "Credits" },
];

export function DashboardNav() {
  const pathname = usePathname();

  return (
    <nav className="mt-6 flex flex-wrap gap-x-1 gap-y-2 border-b border-[var(--line)] text-sm">
      {tabs.map((tab) => {
        // "/dashboard" must not light up for every page beneath it.
        const active =
          tab.href === "/dashboard" ? pathname === tab.href : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2 transition-colors ${
              active
                ? "border-[var(--accent)] text-[var(--ink)]"
                : "border-transparent text-[var(--ink-soft)] hover:border-[var(--line)] hover:text-[var(--ink)]"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
