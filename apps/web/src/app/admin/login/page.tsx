import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CodeForm, CredentialsForm } from "@/components/admin/sign-in-forms";
import { Wordmark } from "@/components/logo";
import { currentAdmin, pendingChallenge } from "@/lib/admin/auth";

export const metadata: Metadata = { title: "Sign in" };

export default async function AdminLoginPage() {
  if (await currentAdmin()) redirect("/admin");
  const challenge = await pendingChallenge();

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[var(--paper)] px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-between">
          <Wordmark />
          <span className="mono border border-[var(--line)] px-2 py-0.5 text-xs uppercase tracking-wider text-[var(--ink-faint)]">
            Admin
          </span>
        </div>
        <div className="sheet p-6 sm:p-8">
          {challenge ? (
            <>
              <h1 className="text-2xl">Check Telegram</h1>
              <p className="mt-2 text-[var(--ink-soft)]">
                We sent a six-digit code to the operator chat. It expires in five minutes.
              </p>
              <CodeForm />
            </>
          ) : (
            <>
              <h1 className="text-2xl">Operator sign-in</h1>
              <p className="mt-2 text-[var(--ink-soft)]">
                Your username and password, then a code on Telegram.
              </p>
              <CredentialsForm />
            </>
          )}
        </div>
        <p className="mt-6 text-sm text-[var(--ink-faint)]">
          Every attempt is logged, and repeated failures lock the address out for 15 minutes.
        </p>
      </div>
    </main>
  );
}
