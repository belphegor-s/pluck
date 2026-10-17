"use client";

import { usePathname } from "next/navigation";
import { PageMain } from "@/components/page-main";

/** Routes that bring their own app shell instead of the marketing header and footer. */
const APP_ROUTES = ["/dashboard", "/onboarding", "/admin"];

export function SiteChrome({
  header,
  footer,
  children,
}: {
  header: React.ReactNode;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  if (APP_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`)))
    return children;
  return (
    <>
      {header}
      <PageMain id="main" className="flex-1">
        {children}
      </PageMain>
      {footer}
    </>
  );
}
