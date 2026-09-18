"use client";

import { useRouter } from "next/navigation";
import { signOut } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      // Destructive: leaving the session is not what someone wants by accident.
      className="border border-[var(--accent)] px-3 py-1 text-xs text-[var(--accent)] transition-colors hover:bg-[var(--accent)] hover:text-white"
      onClick={() => void signOut({ fetchOptions: { onSuccess: () => router.push("/") } })}
    >
      Sign out
    </button>
  );
}
