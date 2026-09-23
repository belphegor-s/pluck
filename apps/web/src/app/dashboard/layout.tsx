import { users } from "@pluck/db";
import { eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/dashboard/app-shell";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { SIDEBAR_COOKIE } from "@/lib/sidebar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login?next=/dashboard");

  const [[account], jar] = await Promise.all([
    db.select({ credits: users.credits }).from(users).where(eq(users.id, session.user.id)),
    cookies(),
  ]);

  return (
    <AppShell
      initialCollapsed={jar.get(SIDEBAR_COOKIE)?.value === "collapsed"}
      user={{
        name: session.user.name ?? "",
        email: session.user.email,
        image: session.user.image ?? null,
        credits: account?.credits ?? 0,
      }}
    >
      {children}
    </AppShell>
  );
}
