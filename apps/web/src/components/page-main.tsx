"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Set after the first page has mounted in this browser tab. The page that
 * loads with the document is painted by the server and should be there at
 * once (fading it in would only delay the largest paint); every page reached
 * by navigating after that settles in instead of cutting.
 */
let navigated = false;

/**
 * The `<main>` of a shell. Keyed by pathname, so each route arrives with a
 * short settle while query-string changes (filters, ranges) leave it alone.
 */
export function PageMain(props: React.ComponentProps<"main">) {
  const pathname = usePathname();
  return <Settle key={pathname} {...props} />;
}

function Settle({ className = "", ...props }: React.ComponentProps<"main">) {
  const [arrive] = useState(() => navigated);
  useEffect(() => {
    navigated = true;
  }, []);
  return <main {...props} className={arrive ? `page-enter ${className}` : className} />;
}
