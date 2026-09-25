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
          {challenge?.enrol ? (
            <>
              <p className="mono text-xs uppercase tracking-wider text-[var(--accent)]">
                First sign-in
              </p>
              <h1 className="mt-2 text-2xl">Set up your authenticator</h1>
              <ol className="mt-4 space-y-2 text-[var(--ink-soft)]">
                <li>1. Scan this with Google Authenticator, 1Password, Authy or any TOTP app.</li>
                <li>2. Type the six-digit code it shows.</li>
              </ol>
              <div className="mt-5 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
                {/* A data URL made on the server: the secret never reaches a third party. */}
                {/* biome-ignore lint/performance/noImgElement: an inline data URL. */}
                <img
                  src={challenge.enrol.qr}
                  alt="QR code for your authenticator app"
                  width={176}
                  height={176}
                  className="size-44 shrink-0 border border-[var(--line)] bg-white p-2"
                />
                <div className="min-w-0 text-sm">
                  <p className="text-[var(--ink-soft)]">Cannot scan? Enter this key instead:</p>
                  <p className="mono mt-2 break-all bg-[var(--paper)] px-2 py-1.5 text-[var(--ink)]">
                    {challenge.enrol.secret}
                  </p>
                  <p className="mt-2 text-[var(--ink-faint)]">
                    Shown only now. Time-based, 6 digits, every 30 seconds.
                  </p>
                </div>
              </div>
              <CodeForm submitLabel="Confirm and sign in" />
            </>
          ) : challenge ? (
            <>
              <h1 className="text-2xl">Enter your code</h1>
              <p className="mt-2 text-[var(--ink-soft)]">
                The six-digit code from your authenticator app.
              </p>
              <CodeForm submitLabel="Sign in" />
            </>
          ) : (
            <>
              <h1 className="text-2xl">Operator sign-in</h1>
              <p className="mt-2 text-[var(--ink-soft)]">
                Your username and password, then a code from your authenticator app.
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
