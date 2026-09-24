"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { signOut } from "@/lib/auth-client";

export function OnboardingSignOut() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => void signOut({ fetchOptions: { onSuccess: () => router.push("/") } })}
      className="flex items-center gap-1.5 text-sm text-[var(--ink-soft)] transition-colors hover:text-[var(--ink)]"
    >
      <LogOut aria-hidden="true" className="size-4" strokeWidth={1.75} />
      Sign out
    </button>
  );
}
