import { cookies } from "next/headers";
import { AppShell } from "@/components/dashboard/app-shell";
import { SIDEBAR_COOKIE } from "@/lib/sidebar";
import { requireWorkspace } from "@/lib/workspace";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [{ user, workspace, workspaces }, jar] = await Promise.all([requireWorkspace(), cookies()]);

  return (
    <AppShell
      initialCollapsed={jar.get(SIDEBAR_COOKIE)?.value === "collapsed"}
      user={{
        name: user.name ?? "",
        email: user.email,
        image: user.image,
        credits: workspace.credits,
      }}
      workspace={{
        id: workspace.id,
        name: workspace.name,
        personal: workspace.personal,
        role: workspace.role,
      }}
      workspaces={workspaces.map((w) => ({
        id: w.id,
        name: w.name,
        personal: w.personal,
        role: w.role,
      }))}
    >
      {children}
    </AppShell>
  );
}
