import type { Metadata } from "next";
import { connection } from "next/server";
import { assertEnabled } from "@/lib/admin/auth";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Admin" },
  robots: { index: false, follow: false, nocache: true },
};

/**
 * The whole panel answers 404 until ADMIN_USERNAME, ADMIN_PASSWORD_HASH and
 * PLUCK_ENCRYPTION_KEY are set. connection() comes first so nothing here is
 * prerendered: the build has no admin settings, and a 404 baked in then would
 * be served (and cached) even after they are set.
 */
export default async function AdminRootLayout({ children }: { children: React.ReactNode }) {
  await connection();
  assertEnabled();
  return children;
}
