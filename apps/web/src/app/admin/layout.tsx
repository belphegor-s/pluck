import type { Metadata } from "next";
import { assertEnabled } from "@/lib/admin/auth";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Admin" },
  robots: { index: false, follow: false, nocache: true },
};

/** The whole panel answers 404 until ADMIN_USERNAME, ADMIN_PASSWORD_HASH and PLUCK_ENCRYPTION_KEY are set. */
export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  assertEnabled();
  return children;
}
