import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/dashboard/sign-out";
import { auth } from "@/lib/auth";

const tabs = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/keys", label: "API keys" },
  { href: "/dashboard/ai", label: "Model provider" },
  { href: "/dashboard/monitors", label: "Monitors" },
  { href: "/dashboard/billing", label: "Credits" },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login?next=/dashboard");

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl">Dashboard</h1>
        <div className="flex items-center gap-3 text-sm text-[var(--ink-soft)]">
          <span>{session.user.email}</span>
          <SignOutButton />
        </div>
      </div>
      <nav className="mt-6 flex flex-wrap gap-x-5 gap-y-2 border-b border-[var(--line)] pb-3 text-sm">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className="text-[var(--ink-soft)] transition-colors hover:text-[var(--ink)]"
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      <div className="pt-8">{children}</div>
    </div>
  );
}
