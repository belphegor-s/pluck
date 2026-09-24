import type { Metadata } from "next";
import Link from "next/link";
import { describeInvitation } from "@/lib/invitations";
import { getSessionUser, roleLabel } from "@/lib/workspace";
import { AcceptInvitation } from "./accept";

export const metadata: Metadata = {
  title: "Join a workspace",
  // An invitation link is a secret; keep it out of indexes and referrers.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export const dynamic = "force-dynamic";

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-lg px-4 py-20 sm:px-6">
      <div className="sheet p-6 sm:p-8">
        <h1 className="text-2xl">{title}</h1>
        <div className="mt-4 space-y-4 text-sm text-[var(--ink-soft)]">{children}</div>
      </div>
    </div>
  );
}

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // Tokens are 43 URL-safe characters; anything else is not worth a lookup.
  const invite = /^[A-Za-z0-9_-]{20,100}$/.test(token) ? await describeInvitation(token) : null;

  if (!invite || invite.revokedAt)
    return (
      <Card title="This invitation is not valid">
        <p>It may have been revoked or replaced by a newer one. Ask for a fresh invite.</p>
      </Card>
    );
  if (invite.acceptedAt)
    return (
      <Card title="Already accepted">
        <p>
          This invitation to {invite.orgName} has been used.{" "}
          <Link href="/dashboard" className="text-[var(--accent)] underline underline-offset-4">
            Open the dashboard
          </Link>
          .
        </p>
      </Card>
    );
  if (invite.expiresAt < new Date())
    return (
      <Card title="This invitation has expired">
        <p>Invitations last 7 days. Ask someone in {invite.orgName} to send a new one.</p>
      </Card>
    );

  const user = await getSessionUser();
  const next = `/invite/${token}`;

  if (!user)
    return (
      <Card title={`Join ${invite.orgName}`}>
        <p>
          You have been invited to join {invite.orgName} as {roleLabel[invite.role].toLowerCase()}.
          Sign in with the GitHub account whose verified email is{" "}
          <span className="text-[var(--ink)]">{invite.email}</span> to accept.
        </p>
        <Link
          href={`/login?next=${encodeURIComponent(next)}`}
          className="inline-block bg-[var(--ink)] px-5 py-2.5 text-[var(--paper)] transition-opacity hover:opacity-85"
        >
          Sign in to accept
        </Link>
      </Card>
    );

  if (user.email.toLowerCase() !== invite.email)
    return (
      <Card title="This invitation is for someone else">
        <p>
          It was sent to <span className="text-[var(--ink)]">{invite.email}</span>, and you are
          signed in as <span className="text-[var(--ink)]">{user.email}</span>. Sign in with the
          GitHub account for that address, or ask for an invite to yours.
        </p>
      </Card>
    );

  return (
    <Card title={`Join ${invite.orgName}`}>
      <p>
        You will join as {roleLabel[invite.role].toLowerCase()} and can switch between{" "}
        {invite.orgName} and your other workspaces from the top of the dashboard sidebar.
      </p>
      <AcceptInvitation token={token} orgName={invite.orgName} />
    </Card>
  );
}
