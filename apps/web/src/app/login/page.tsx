import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SignInWithGitHub } from "@/components/sign-in";
import { auth } from "@/lib/auth";
import { SITE, safeNext } from "@/lib/site";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const session = await auth.api.getSession({ headers: await headers() });
  if (session?.user) redirect(safeNext(next));

  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-20 sm:px-6">
      <h1 className="text-3xl">Sign in</h1>
      <p className="mt-3 text-sm text-[var(--ink-soft)]">
        {SITE.name} uses GitHub for accounts. New accounts start with 1,000 credits.
      </p>
      {error && (
        <p className="mt-4 text-sm text-[var(--accent)]">
          {error === "access_denied"
            ? "GitHub sign-in was cancelled."
            : "We could not sign you in. If your GitHub email is unverified, verify it and try again."}
        </p>
      )}
      <div className="mt-6">
        <SignInWithGitHub next={next} />
      </div>
      <p className="mt-6 text-xs text-[var(--ink-faint)]">
        We read your GitHub account id and your verified primary email. Nothing is posted on your
        behalf, and no repository access is requested.
      </p>
    </div>
  );
}
