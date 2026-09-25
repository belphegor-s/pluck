import Link from "next/link";
import { Logo } from "@/components/logo";
import { SITE } from "@/lib/site";

const groups = [
  {
    title: "Product",
    links: [
      { href: "/playground", label: "Playground" },
      { href: "/pricing", label: "Pricing" },
      { href: "/dashboard", label: "Dashboard" },
      { href: "/enterprise", label: "Talk to us" },
    ],
  },
  {
    title: "Developers",
    links: [
      { href: "/docs", label: "Documentation" },
      { href: `${SITE.apiUrl}/docs`, label: "API reference" },
      { href: "/docs/mcp", label: "MCP server" },
      { href: "/docs/self-hosting", label: "Self-hosting" },
    ],
  },
  {
    title: "Project",
    links: [
      { href: SITE.repo, label: "GitHub" },
      { href: "/legal/terms", label: "Terms" },
      { href: "/legal/privacy", label: "Privacy" },
      { href: "/trust", label: "Trust" },
      { href: "/legal/licenses", label: "Licences" },
      { href: `mailto:${SITE.contactEmail}`, label: "Email us" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-[var(--line)]">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.5fr_repeat(3,1fr)]">
        <div>
          <Logo size={26} />
          <p className="mt-3 text-sm text-[var(--ink-soft)]">
            Open-source web context for AI. Run ours, or run your own.
          </p>
        </div>
        {groups.map((group) => (
          <div key={group.title}>
            <h2 className="font-[family-name:var(--font-sans)] text-sm font-semibold">
              {group.title}
            </h2>
            {/* Roomier rows on a phone, where these are thumb targets rather
                than pointer targets. */}
            <ul className="mt-2 text-sm text-[var(--ink-soft)] sm:mt-3">
              {group.links.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="inline-block py-2 transition-colors hover:text-[var(--ink)] sm:py-1"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 border-t border-[var(--line)] px-4 py-5 text-xs text-[var(--ink-faint)] sm:px-6">
        <p>AGPL-3.0. Built for people who would rather read the source.</p>
        <p className="mono">{SITE.url.replace(/^https?:\/\//, "")}</p>
      </div>
    </footer>
  );
}
