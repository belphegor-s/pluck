import "server-only";
import { accounts, sessions, users, verifications } from "@pluck/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/lib/db";
import { SITE } from "@/lib/site";

interface GithubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
}

/**
 * Addresses GitHub told us are unverified, remembered for the moment between
 * reading the profile and the database hook that guards account creation.
 */
const UNVERIFIED = new Set<string>();

/**
 * Reads the GitHub profile ourselves.
 *
 * The stock implementation matches `/user`'s email against `/user/emails` with
 * `===`, then defaults to unverified, so a case difference, a hidden profile
 * email, or a failed second request all look identical to "not verified" and
 * lock the account out. Here the primary verified address wins, comparison is
 * case-insensitive, and a failed lookup is treated as unknown rather than bad.
 */
async function githubUserInfo(token: { accessToken?: string }): Promise<{
  user: { name: string; email: string; image?: string; emailVerified: boolean } & Record<
    string,
    unknown
  >;
  // The provider's own profile type; we only read a handful of fields.
  data: never;
} | null> {
  const headers = {
    authorization: `Bearer ${token.accessToken}`,
    accept: "application/vnd.github+json",
    "user-agent": "Pluck",
  };
  const profileRes = await fetch("https://api.github.com/user", { headers });
  if (!profileRes.ok) return null;
  const profile = (await profileRes.json()) as {
    id: number;
    login: string;
    name?: string | null;
    email?: string | null;
    avatar_url?: string;
  };

  const emailsRes = await fetch("https://api.github.com/user/emails", { headers }).catch(
    () => null,
  );
  const emails = emailsRes?.ok ? ((await emailsRes.json()) as GithubEmail[]) : null;

  const sameAddress = (a?: string | null, b?: string | null) =>
    Boolean(a && b && a.toLowerCase() === b.toLowerCase());

  const chosen =
    emails?.find((e) => e.primary && e.verified) ??
    emails?.find((e) => sameAddress(e.email, profile.email) && e.verified) ??
    emails?.find((e) => e.verified) ??
    emails?.find((e) => e.primary) ??
    null;

  const email =
    chosen?.email ??
    profile.email ??
    // Guaranteed by GitHub and always deliverable through them.
    `${profile.id}+${profile.login}@users.noreply.github.com`;

  const verified = chosen
    ? chosen.verified
    : emails
      ? (emails.find((e) => sameAddress(e.email, email))?.verified ?? false)
      : // No usable list: unknown, not unverified.
        true;

  if (verified) UNVERIFIED.delete(email.toLowerCase());
  else UNVERIFIED.add(email.toLowerCase());

  return {
    user: {
      name: profile.name || profile.login || "",
      email,
      image: profile.avatar_url,
      emailVerified: verified,
    },
    data: profile as unknown as never,
  };
}

export const auth = betterAuth({
  appName: "Pluck",
  baseURL: process.env.BETTER_AUTH_URL ?? SITE.url,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user: users, session: sessions, account: accounts, verification: verifications },
  }),
  emailAndPassword: { enabled: false },
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID ?? "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
      scope: ["read:user", "user:email"],
      getUserInfo: githubUserInfo,
    },
  },
  account: {
    // GitHub accounts can carry unverified addresses, so an attacker could claim
    // someone else's email. Identity is the GitHub account id; never the email.
    accountLinking: { enabled: false },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  user: {
    additionalFields: {
      role: { type: "string", input: false, defaultValue: "user" },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          // Identity is the GitHub account id (account linking is off), so an
          // unverified address cannot take over an existing account. The check
          // below only refuses an address GitHub positively reports as
          // unverified, never one it simply did not tell us about.
          if (user.email && UNVERIFIED.has(user.email.toLowerCase())) {
            throw new APIError("FORBIDDEN", {
              message: `GitHub reports ${user.email} as unverified. Verify it on GitHub, or make a verified address your primary one, then sign in again.`,
            });
          }
          return { data: user };
        },
      },
    },
  },
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
