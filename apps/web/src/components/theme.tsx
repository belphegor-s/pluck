"use client";

import { Moon, Sun } from "lucide-react";
import { ThemeProvider as NextThemes, useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemes attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </NextThemes>
  );
}

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === "dark";
  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      className="grid h-8 w-8 place-items-center border border-[var(--line)] text-[var(--ink-soft)] transition-colors hover:text-[var(--ink)]"
    >
      {isDark ? (
        <Sun aria-hidden="true" className="size-[15px]" strokeWidth={1.75} />
      ) : (
        <Moon aria-hidden="true" className="size-[15px]" strokeWidth={1.75} />
      )}
    </button>
  );
}
