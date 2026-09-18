import Link from "next/link";
import { Wordmark } from "@/components/logo";
import { MobileNav } from "@/components/mobile-nav";
import { ThemeToggle } from "@/components/theme";
import { nav } from "@/lib/site";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--paper)_88%,transparent)] backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:gap-6 sm:px-6">
        <Link href="/" className="shrink-0" aria-label="Pluck home">
          <Wordmark />
        </Link>
        <nav className="hidden items-center gap-5 text-sm text-[var(--ink-soft)] md:flex">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="transition-colors hover:text-[var(--ink)]"
              {...("external" in item && item.external
                ? { target: "_blank", rel: "noreferrer" }
                : {})}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          {/* The call to action stays visible at every width; the rest of the
              navigation moves into the menu below md. */}
          <Link
            href="/dashboard"
            className="hidden border border-[var(--ink)] bg-[var(--ink)] px-3 py-1.5 text-sm text-[var(--paper)] transition-opacity hover:opacity-85 sm:inline-block"
          >
            Get an API key
          </Link>
          <MobileNav />
        </div>
      </div>
    </header>
  );
}
