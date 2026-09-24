import { SIGNUP_GRANT } from "@pluck/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CreateWorkspaceForm } from "@/components/dashboard/team-forms";
import { Wordmark } from "@/components/logo";
import { formatNumber } from "@/lib/format";
import { openInvitationsFor } from "@/lib/invitations";
import { getSessionUser, listWorkspaces, roleLabel } from "@/lib/workspace";
import { JoinInvitation } from "./join";
import { OnboardingSignOut } from "./sign-out";

export const metadata: Metadata = { title: "Set up your workspace", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * Where a new account lands after signing in: name the first workspace, or
 * join one they have been invited to. Anyone who already belongs to a
 * workspace goes straight to the dashboard.
 */
export default async function OnboardingPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/onboarding");
  if ((await listWorkspaces(user.id)).length > 0) redirect("/dashboard");

  const invites = user.emailVerified ? await openInvitationsFor(user.email) : [];
  const first = (user.name || user.email.split("@")[0] || "").trim().split(/\s+/)[0];

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-14 items-center border-b border-[var(--line)] px-4 sm:px-6">
        <Link href="/" aria-label="Pluck home">
          <Wordmark />
        </Link>
        <div className="ml-auto flex min-w-0 items-center gap-4">
          <span className="hidden truncate text-sm text-[var(--ink-faint)] sm:inline">
            {user.email}
          </span>
          <OnboardingSignOut />
        </div>
      </header>

      <main
        id="main"
        className="flex flex-1 items-start justify-center px-4 py-12 sm:items-center sm:py-16"
      >
        <div className="w-full max-w-lg space-y-8">
          <div>
            <p className="mono text-xs uppercase tracking-wider text-[var(--ink-faint)]">
              Welcome{first ? `, ${first}` : ""}
            </p>
            <h1 className="mt-2 text-3xl">
              {invites.length > 0 ? "Join your team, or start your own" : "Name your workspace"}
            </h1>
            <p className="mt-3 text-[var(--ink-soft)]">
              Everything in Pluck lives in a workspace: API keys, credits, monitors and webhooks.
              Use your company or project name; you can rename it and invite people any time.
              {SIGNUP_GRANT > 0 && ` It starts with ${formatNumber(SIGNUP_GRANT)} free credits.`}
            </p>
          </div>

          {invites.length > 0 && (
            <section className="sheet divide-y divide-[var(--line)]">
              <p className="px-4 py-3 text-sm text-[var(--ink-soft)]">
                You have been invited to join:
              </p>
              {invites.map((invite) => (
                <div key={invite.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{invite.orgName}</p>
                    <p className="text-xs text-[var(--ink-faint)]">
                      as {roleLabel[invite.role].toLowerCase()}
                    </p>
                  </div>
                  <JoinInvitation id={invite.id} orgName={invite.orgName} />
                </div>
              ))}
            </section>
          )}

          {invites.length > 0 && (
            <p className="text-sm text-[var(--ink-faint)]">Or create a workspace of your own:</p>
          )}
          <div className="sheet p-5 sm:p-6">
            <CreateWorkspaceForm
              defaultName={first ? `${first}'s workspace` : ""}
              submitLabel="Create workspace"
            />
          </div>
        </div>
      </main>
    </div>
  );
}
