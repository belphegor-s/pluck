"use server";

import { randomBytes } from "node:crypto";
import { isProviderId, keyHint, SecretBox } from "@pluck/ai";
import { assertPublicUrl } from "@pluck/core";
import {
  apiKeys,
  contactRequests,
  llmCredentials,
  members,
  newId,
  organizations,
  userProxies,
  users,
} from "@pluck/db";
import { checkProxyUrl, createMailer, generateApiKey } from "@pluck/runtime";
import { OWNER_USER_ID } from "@pluck/shared";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { type Actor, callApiAs } from "@/lib/api";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { proxyDirectory } from "@/lib/proxies";
import { can, getWorkspace, type Role, type Workspace } from "@/lib/workspace";

export type ActionState = { ok?: string; error?: string; secret?: string };

async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("Sign in to continue.");
  return session.user;
}

/**
 * The signed-in member and their current workspace, refusing anything their
 * role does not allow. Every mutation below goes through here, so the
 * workspace a change lands in is always one the user belongs to.
 */
async function requireMember(
  allowed?: (role: Role) => boolean,
  action = "do that",
): Promise<{ user: { id: string; email: string }; org: Workspace; actor: Actor }> {
  const ctx = await getWorkspace();
  if (!ctx) throw new Error("Sign in to continue.");
  if (allowed && !allowed(ctx.workspace.role))
    throw new Error(`Only workspace owners and admins can ${action}.`);
  return {
    user: ctx.user,
    org: ctx.workspace,
    actor: { userId: ctx.user.id, orgId: ctx.workspace.id },
  };
}

const fail = (error: unknown): ActionState => ({
  error: error instanceof Error ? error.message : "Something went wrong.",
});

export async function createApiKey(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const { user, org } = await requireMember();
    const name = z
      .string()
      .trim()
      .min(1)
      .max(60)
      .catch("Default")
      .parse(formData.get("name") || "Default");
    const existing = await db
      .select({ id: apiKeys.id })
      .from(apiKeys)
      .where(eq(apiKeys.orgId, org.id));
    if (existing.length >= 25)
      return { error: "This workspace has reached the limit of 25 keys. Revoke one first." };

    const { key, prefix, hash } = generateApiKey();
    await db
      .insert(apiKeys)
      .values({ id: newId("key"), orgId: org.id, createdBy: user.id, name, prefix, hash });
    revalidatePath("/dashboard/keys");
    return { ok: `Key "${name}" created. Copy it now — it is not shown again.`, secret: key };
  } catch (err) {
    return fail(err);
  }
}

export async function revokeApiKey(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const { user, org } = await requireMember();
    const id = String(formData.get("id"));
    // Members may revoke keys they made; admins and owners any in the workspace.
    const revoked = await db
      .update(apiKeys)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(apiKeys.id, id),
          eq(apiKeys.orgId, org.id),
          can.revokeAnyKey(org.role) ? undefined : eq(apiKeys.createdBy, user.id),
        ),
      )
      .returning({ id: apiKeys.id });
    if (!revoked.length) return { error: "You can only revoke keys you created." };
    revalidatePath("/dashboard/keys");
    return { ok: "Key revoked. It stops working within 30 seconds." };
  } catch (err) {
    return fail(err);
  }
}

export async function saveLlmKey(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const { org } = await requireMember(can.manageCredentials, "change model provider keys");
    const provider = String(formData.get("provider"));
    if (!isProviderId(provider)) return { error: "Pick a provider." };
    const apiKey = String(formData.get("apiKey") ?? "").trim();
    const model = String(formData.get("model") ?? "").trim() || null;
    const baseUrl = String(formData.get("baseUrl") ?? "").trim() || null;
    if (!apiKey && provider !== "openai-compatible")
      return { error: "Paste your provider API key." };
    if (provider === "openai-compatible" && !baseUrl)
      return { error: "A base URL is required for OpenAI-compatible providers." };
    if (baseUrl) assertPublicUrl(baseUrl, false);

    const secret = process.env.PLUCK_ENCRYPTION_KEY;
    if (!secret) return { error: "This instance has no encryption key configured." };
    const box = new SecretBox(secret);
    const sealed = box.seal(apiKey || "not-needed");
    const hint = keyHint(apiKey || "local");

    await db
      .insert(llmCredentials)
      .values({
        id: newId("llm"),
        orgId: org.id,
        provider,
        encryptedKey: sealed,
        keyHint: hint,
        model,
        baseUrl,
        isDefault: false,
      })
      .onConflictDoUpdate({
        target: [llmCredentials.orgId, llmCredentials.provider],
        set: { encryptedKey: sealed, keyHint: hint, model, baseUrl, updatedAt: new Date() },
      });

    if (formData.get("isDefault") === "on") {
      await db
        .update(llmCredentials)
        .set({ isDefault: false })
        .where(eq(llmCredentials.orgId, org.id));
      await db
        .update(llmCredentials)
        .set({ isDefault: true })
        .where(and(eq(llmCredentials.orgId, org.id), eq(llmCredentials.provider, provider)));
    }
    revalidatePath("/dashboard/ai");
    return {
      ok: `Saved. AI calls now use your ${provider} account and cost 1 credit instead of 8.`,
    };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteLlmKey(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const { org } = await requireMember(can.manageCredentials, "change model provider keys");
    const provider = String(formData.get("provider"));
    if (!isProviderId(provider)) return { error: "Unknown provider." };
    await db
      .delete(llmCredentials)
      .where(and(eq(llmCredentials.orgId, org.id), eq(llmCredentials.provider, provider)));
    revalidatePath("/dashboard/ai");
    return { ok: "Key removed." };
  } catch (err) {
    return fail(err);
  }
}

const contactSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.email().max(320),
  company: z.string().trim().max(160).optional(),
  volume: z.string().trim().max(120).optional(),
  message: z.string().trim().min(10, "Tell us a little more.").max(4000),
});

export async function submitContact(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const parsed = contactSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success)
      return { error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
    const session = await auth.api.getSession({ headers: await headers() });
    const { name, email, company, volume, message } = parsed.data;
    await db.insert(contactRequests).values({ ...parsed.data, userId: session?.user.id ?? null });

    // The row is the record; the email is what makes anyone read it. A failure
    // to send must not lose the enquiry, so it is logged and swallowed.
    const to = process.env.CONTACT_EMAIL;
    if (to) {
      const mailer = createMailer({
        RESEND_API_KEY: process.env.RESEND_API_KEY,
        EMAIL_FROM: process.env.EMAIL_FROM,
      });
      const result = await mailer.send({
        to,
        replyTo: email,
        subject: `Pluck enquiry from ${name}${company ? ` (${company})` : ""}`,
        text: [
          `From: ${name} <${email}>`,
          company && `Company: ${company}`,
          volume && `Volume: ${volume}`,
          session?.user.id && `Account: ${session.user.email}`,
          "",
          message,
        ]
          .filter(Boolean)
          .join("\n"),
      });
      if (!result.ok) console.error("contact email failed:", result.error);
    }
    return { ok: "Thanks — we read every message and usually reply within a day." };
  } catch (err) {
    return fail(err);
  }
}

/* --------------------------------------------------------------------- proxies */

const MAX_PROXIES = 20;

export async function addProxy(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const { org } = await requireMember(can.manageCredentials, "manage proxies");
    const label = String(formData.get("label") ?? "").trim() || "Proxy";
    const tier = String(formData.get("tier") ?? "datacenter");
    const url = String(formData.get("url") ?? "").trim();
    if (tier !== "datacenter" && tier !== "residential") return { error: "Unknown proxy tier." };
    if (!url) return { error: "Paste the proxy URL from your provider." };

    const [{ count } = { count: 0 }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(userProxies)
      .where(eq(userProxies.orgId, org.id));
    if (count >= MAX_PROXIES)
      return { error: `A workspace can store up to ${MAX_PROXIES} proxies.` };

    // Validation and encryption both live in the runtime, so the API and the
    // dashboard cannot disagree about what a usable proxy URL is.
    const directory = proxyDirectory();
    const { encryptedUrl, urlHint } = directory.seal(url);

    await db.insert(userProxies).values({
      id: newId("prx"),
      orgId: org.id,
      label: label.slice(0, 60),
      tier,
      encryptedUrl,
      urlHint,
    });
    directory.invalidate(org.id);
    revalidatePath("/dashboard/proxies");
    return { ok: `${label} added.` };
  } catch (err) {
    return fail(err);
  }
}

export async function setProxyActive(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const { org } = await requireMember(can.manageCredentials, "manage proxies");
    const id = String(formData.get("id"));
    const active = String(formData.get("active")) === "true";
    await db
      .update(userProxies)
      // Re-enabling clears the failure count: the operator is saying it is fixed.
      .set({ active, ...(active ? { failures: 0 } : {}) })
      .where(and(eq(userProxies.id, id), eq(userProxies.orgId, org.id)));
    proxyDirectory().invalidate(org.id);
    revalidatePath("/dashboard/proxies");
    return { ok: active ? "Proxy enabled." : "Proxy paused." };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteProxy(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const { org } = await requireMember(can.manageCredentials, "manage proxies");
    const id = String(formData.get("id"));
    await db.delete(userProxies).where(and(eq(userProxies.id, id), eq(userProxies.orgId, org.id)));
    proxyDirectory().invalidate(org.id);
    revalidatePath("/dashboard/proxies");
    return { ok: "Proxy removed." };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Checks a stored proxy by fetching a page through it. Nothing is billed: this
 * is the dashboard proving the credentials work before a real job depends on
 * them.
 */
export async function testProxy(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const { org } = await requireMember(can.manageCredentials, "manage proxies");
    const id = String(formData.get("id"));
    const [row] = await db
      .select()
      .from(userProxies)
      .where(and(eq(userProxies.id, id), eq(userProxies.orgId, org.id)));
    if (!row) return { error: "Proxy not found." };

    const started = Date.now();
    const result = await checkProxyUrl(proxyDirectory().reveal(row.encryptedUrl));
    await db
      .update(userProxies)
      .set(
        result.ok
          ? { failures: 0, lastUsedAt: new Date() }
          : { failures: Math.min(row.failures + 1, 99) },
      )
      .where(eq(userProxies.id, id));
    proxyDirectory().invalidate(org.id);
    revalidatePath("/dashboard/proxies");
    return result.ok
      ? { ok: `Working — exit IP ${result.ip}, ${Date.now() - started} ms.` }
      : { error: result.error };
  } catch (err) {
    return fail(err);
  }
}

/* -------------------------------------------------------------------- monitors */

/** Empty form fields mean "not set", not an empty string the API must reject. */
const field = (formData: FormData, key: string) => {
  const value = String(formData.get(key) ?? "").trim();
  return value || undefined;
};

export async function createMonitor(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const { actor } = await requireMember();
    const type = String(formData.get("type") ?? "page");
    const result = await callApiAs(actor, "monitorCreate", {
      name: field(formData, "name"),
      type,
      url: field(formData, "url"),
      intervalMinutes: Number(formData.get("intervalMinutes") ?? 1440),
      webhook: field(formData, "webhook"),
      selector: type === "page" ? field(formData, "selector") : undefined,
      prompt: type === "extract" ? field(formData, "prompt") : undefined,
    });
    if (!result.ok) return { error: result.error };
    revalidatePath("/dashboard/monitors");
    return { ok: `Watching ${result.data.url}. The first check runs now.` };
  } catch (err) {
    return fail(err);
  }
}

export async function updateMonitor(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const { actor } = await requireMember();
    const id = String(formData.get("id"));
    const patch: Record<string, unknown> = { id };
    if (formData.has("active")) patch.active = String(formData.get("active")) === "true";
    if (formData.has("name")) patch.name = field(formData, "name");
    if (formData.has("intervalMinutes"))
      patch.intervalMinutes = Number(formData.get("intervalMinutes"));
    // Present-but-empty clears it; absent leaves it as it is.
    if (formData.has("webhook")) patch.webhook = field(formData, "webhook") ?? null;
    if (formData.has("selector")) patch.selector = field(formData, "selector") ?? null;
    const result = await callApiAs(actor, "monitorUpdate", patch);
    if (!result.ok) return { error: result.error };
    revalidatePath("/dashboard/monitors");
    revalidatePath(`/dashboard/monitors/${id}`);
    return { ok: formData.has("active") ? (patch.active ? "Resumed." : "Paused.") : "Saved." };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteMonitor(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const { actor } = await requireMember();
    const result = await callApiAs(actor, "monitorDelete", { id: String(formData.get("id")) });
    if (!result.ok) return { error: result.error };
    revalidatePath("/dashboard/monitors");
    return { ok: "Monitor deleted." };
  } catch (err) {
    return fail(err);
  }
}

/* -------------------------------------------------------------------- webhooks */

export async function redeliverWebhook(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { actor } = await requireMember();
    const result = await callApiAs(actor, "webhookRedeliver", {
      id: String(formData.get("id")),
    });
    if (!result.ok) return { error: result.error };
    revalidatePath("/dashboard/webhooks");
    return { ok: "Queued again." };
  } catch (err) {
    return fail(err);
  }
}

export async function sendTestWebhook(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { actor } = await requireMember();
    const result = await callApiAs(actor, "webhookTest", { url: field(formData, "url") });
    if (!result.ok) return { error: result.error };
    revalidatePath("/dashboard/webhooks");
    return { ok: "Test event queued — it appears below within a few seconds." };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Issues a new signing secret. Receivers verifying the old one start rejecting
 * deliveries immediately, which is the point when a secret has leaked.
 */
export async function rotateWebhookSecret(
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  try {
    const { org } = await requireMember(can.manageCredentials, "rotate the signing secret");
    await db
      .update(organizations)
      .set({ webhookSecret: randomBytes(24).toString("hex") })
      .where(eq(organizations.id, org.id));
    revalidatePath("/dashboard/webhooks");
    return { ok: "New secret issued. Update your receivers before the next delivery." };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Deletes the signed-in account and everything tied to it.
 *
 * Every workspace they are the only member of goes with them. A workspace
 * other people still rely on is not taken down with one account: if they are
 * its only owner, they must hand it over or delete it first. The email must be typed back, because none of this can
 * be undone.
 */
export async function deleteAccount(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
    const typed = String(formData.get("confirm") ?? "")
      .trim()
      .toLowerCase();
    if (!user.email || typed !== user.email.toLowerCase())
      return { error: "Type your account email exactly to confirm." };
    // The self-hosted owner is recreated from BOOTSTRAP_API_KEY on every boot,
    // so deleting it would look like it worked and then quietly undo itself.
    if (user.id === OWNER_USER_ID)
      return { error: "The instance owner cannot be deleted. Unset BOOTSTRAP_API_KEY instead." };

    const blocked = await db.transaction(async (tx) => {
      const teams = await tx
        .select({ id: organizations.id, name: organizations.name, role: members.role })
        .from(members)
        .innerJoin(organizations, eq(organizations.id, members.orgId))
        .where(eq(members.userId, user.id));

      const solo: string[] = [];
      for (const team of teams) {
        const others = await tx
          .select({ role: members.role })
          .from(members)
          .where(and(eq(members.orgId, team.id), ne(members.userId, user.id)));
        if (others.length === 0) solo.push(team.id);
        else if (team.role === "owner" && !others.some((o) => o.role === "owner")) return team.name;
      }
      if (solo.length) await tx.delete(organizations).where(inArray(organizations.id, solo));
      await tx.delete(users).where(eq(users.id, user.id));
      return null;
    });
    if (blocked)
      return {
        error: `You are the only owner of ${blocked}. Make someone else an owner, or delete that workspace, first.`,
      };
  } catch (err) {
    return fail(err);
  }
  redirect("/");
}
