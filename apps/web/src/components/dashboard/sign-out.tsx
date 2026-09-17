"use client";

import { useRouter } from "next/navigation";
import { signOut } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="underline underline-offset-4 transition-colors hover:text-[var(--ink)]"
      onClick={() => void signOut({ fetchOptions: { onSuccess: () => router.push("/") } })}
    >
      Sign out
    </button>
  );
}
