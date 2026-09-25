import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdmin } from "@/lib/admin/auth";

/** Signed-in pages. Each page and action checks the session again on its own. */
export default async function AdminPanelLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin();
  return <AdminShell ip={session.ip}>{children}</AdminShell>;
}
