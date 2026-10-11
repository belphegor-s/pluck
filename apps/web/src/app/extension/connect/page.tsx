import { extensionConnectParams, SIGNUP_GRANT } from "@pluck/shared";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignInWithGitHub } from "@/components/sign-in";
import { isAllowedExtension } from "@/lib/extension";
import { formatNumber } from "@/lib/format";
import { SITE } from "@/lib/site";
import { getSessionUser, listWorkspaces, WORKSPACE_COOKIE } from "@/lib/workspace";
import { ConnectExtension } from "./connect";

export const metadata: Metadata = {
  title: "Connect the extension",
  // The query string carries a sign-in in progress; keep it out of indexes and referrers.
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

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * Where the browser extension sends someone to sign in. Accounts are made
 * here, on the site, and nowhere else: the extension only ever receives an
 * API key, after the person signed in to this page says so.
 */
export default async function ConnectExtensionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const parsed = extensionConnectParams.safeParse({
    ext: first(query.ext),
    challenge: first(query.challenge),
    state: first(query.state),
    device: first(query.device) || undefined,
  });

  if (!parsed.success)
    return (
      <Card title="This link is not valid">
        <p>
          Sign-in starts in the extension: open {SITE.name} from your browser toolbar and choose
          Connect.
        </p>
        <Link href="/extension" className="text-[var(--accent)] underline underline-offset-4">
          About the extension
        </Link>
      </Card>
    );

  const params = parsed.data;
  if (!isAllowedExtension(params.ext))
    return (
      <Card title="Extension not recognised">
        <p>
          This copy of the extension is not one {SITE.name} signs in. Install the published one, or
          paste an API key into the extension's settings instead.
        </p>
        <p>
          Running your own instance? Add this extension's id to{" "}
          <span className="mono text-[var(--ink)]">CHROME_EXTENSION_IDS</span>:{" "}
          <span className="mono break-all text-[var(--ink)]">{params.ext}</span>
        </p>
      </Card>
    );

  const self = `/extension/connect?${new URLSearchParams(
    Object.entries(params).filter((entry): entry is [string, string] => Boolean(entry[1])),
  )}`;

  const user = await getSessionUser();
  if (!user)
    return (
      <Card title="Connect the extension">
        <p>
          Sign in, or create an account, to use {SITE.name} from your browser.
          {SIGNUP_GRANT > 0 &&
            ` New accounts start with ${formatNumber(SIGNUP_GRANT)} free credits, no card needed.`}
        </p>
        <SignInWithGitHub next={self} />
        <p className="text-xs text-[var(--ink-faint)]">
          We read your GitHub account id and your verified primary email. Nothing is posted on your
          behalf, and no repository access is requested.
        </p>
      </Card>
    );

  const workspaces = await listWorkspaces(user.id);
  // A brand new account names its workspace first, then lands back here.
  if (workspaces.length === 0) redirect(`/onboarding?next=${encodeURIComponent(self)}`);

  const chosen = (await cookies()).get(WORKSPACE_COOKIE)?.value;
  const initial = workspaces.find((w) => w.id === chosen)?.id ?? workspaces[0]!.id;

  return (
    <Card title="Connect the extension">
      <p>
        Signed in as <span className="text-[var(--ink)]">{user.email}</span>.
      </p>
      <ConnectExtension
        ext={params.ext}
        challenge={params.challenge}
        state={params.state}
        device={params.device}
        workspaces={workspaces.map((w) => ({ id: w.id, name: w.name, credits: w.credits }))}
        initial={initial}
      />
    </Card>
  );
}
