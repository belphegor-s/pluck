import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { DashboardNav } from "@/components/dashboard/nav";
import { SignOutButton } from "@/components/dashboard/sign-out";
import { auth } from "@/lib/auth";

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
      <DashboardNav />
      <div className="pt-8">{children}</div>
    </div>
  );
}
