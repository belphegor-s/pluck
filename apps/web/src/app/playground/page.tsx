import type { Metadata } from "next";
import { headers } from "next/headers";
import { Playground } from "@/components/playground";
import { SignInWithGitHub } from "@/components/sign-in";
import { auth } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Playground",
  description: "Run any Pluck endpoint against a live URL and copy the request as code.",
};

export default async function PlaygroundPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl">Playground</h1>
      <p className="mt-2 max-w-[62ch] text-sm text-[var(--ink-soft)]">
        Every endpoint, against real URLs, billed to your account at the same rates as the API. Edit
        the request on the left and copy it as code when it does what you want.
      </p>
      {session?.user ? (
        <div className="mt-8">
          <Playground />
        </div>
      ) : (
        <div className="sheet mt-8 max-w-md p-6">
          <p className="text-sm text-[var(--ink-soft)]">
            Sign in to run requests — the playground spends credits from your account.
          </p>
          <div className="mt-4">
            <SignInWithGitHub next="/playground" />
          </div>
        </div>
      )}
    </div>
  );
}
