import "server-only";
import { accounts, creditLedger, sessions, users, verifications } from "@pluck/db";
import { SIGNUP_GRANT } from "@pluck/shared";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { SITE } from "@/lib/site";

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
      credits: { type: "number", input: false, defaultValue: 0 },
      role: { type: "string", input: false, defaultValue: "user" },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          if (!user.emailVerified) {
            throw new APIError("FORBIDDEN", {
              message: "Verify your email address with GitHub, then sign in again.",
            });
          }
          return { data: user };
        },
        after: async (user) => {
          if (SIGNUP_GRANT <= 0) return;
          await db.transaction(async (tx) => {
            const inserted = await tx
              .insert(creditLedger)
              .values({
                userId: user.id,
                delta: SIGNUP_GRANT,
                reason: "signup",
                reference: `signup:${user.id}`,
              })
              .onConflictDoNothing({ target: creditLedger.reference })
              .returning({ id: creditLedger.id });
            if (inserted.length) {
              await tx
                .update(users)
                .set({ credits: sql`${users.credits} + ${SIGNUP_GRANT}` })
                .where(eq(users.id, user.id));
            }
          });
        },
      },
    },
  },
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
