"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ScrollTabs } from "@/components/scroll-tabs";

const tabs = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/keys", label: "API keys" },
  { href: "/dashboard/ai", label: "Model provider" },
  { href: "/dashboard/monitors", label: "Monitors" },
  { href: "/dashboard/webhooks", label: "Webhooks" },
  { href: "/dashboard/proxies", label: "Proxies" },
  { href: "/dashboard/billing", label: "Credits" },
  { href: "/dashboard/invoices", label: "Invoices" },
];

export function DashboardNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Dashboard" className="mt-6 border-b border-[var(--line)] text-sm">
      <ScrollTabs label="dashboard sections" className="-mb-px">
        {tabs.map((tab) => {
          // "/dashboard" must not light up for every page beneath it.
          const active =
            tab.href === "/dashboard" ? pathname === tab.href : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={`shrink-0 snap-start whitespace-nowrap border-b-2 px-3 py-2 transition-colors ${
                active
                  ? "border-[var(--accent)] text-[var(--ink)]"
                  : "border-transparent text-[var(--ink-soft)] hover:border-[var(--line)] hover:text-[var(--ink)]"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </ScrollTabs>
    </nav>
  );
}
