"use server";

import { isProviderId, keyHint, SecretBox } from "@pluck/ai";
import { assertPublicUrl } from "@pluck/core";
import { apiKeys, contactRequests, llmCredentials, newId, userProxies } from "@pluck/db";
import { checkProxyUrl, generateApiKey } from "@pluck/runtime";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { proxyDirectory } from "@/lib/proxies";

export type ActionState = { ok?: string; error?: string; secret?: string };

async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("Sign in to continue.");
  return session.user;
}

const fail = (error: unknown): ActionState => ({
  error: error instanceof Error ? error.message : "Something went wrong.",
});

export async function createApiKey(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
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
      .where(eq(apiKeys.userId, user.id));
    if (existing.length >= 25)
      return { error: "You have reached the limit of 25 keys. Revoke one first." };

    const { key, prefix, hash } = generateApiKey();
    await db.insert(apiKeys).values({ id: newId("key"), userId: user.id, name, prefix, hash });
    revalidatePath("/dashboard/keys");
    return { ok: `Key "${name}" created. Copy it now — it is not shown again.`, secret: key };
  } catch (err) {
    return fail(err);
  }
}

export async function revokeApiKey(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
    const id = String(formData.get("id"));
    await db
      .update(apiKeys)
      .set({ revokedAt: new Date() })
      .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, user.id)));
    revalidatePath("/dashboard/keys");
    return { ok: "Key revoked. It stops working within 30 seconds." };
  } catch (err) {
    return fail(err);
  }
}

export async function saveLlmKey(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
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
        userId: user.id,
        provider,
        encryptedKey: sealed,
        keyHint: hint,
        model,
        baseUrl,
        isDefault: false,
      })
      .onConflictDoUpdate({
        target: [llmCredentials.userId, llmCredentials.provider],
        set: { encryptedKey: sealed, keyHint: hint, model, baseUrl, updatedAt: new Date() },
      });

    if (formData.get("isDefault") === "on") {
      await db
        .update(llmCredentials)
        .set({ isDefault: false })
        .where(eq(llmCredentials.userId, user.id));
      await db
        .update(llmCredentials)
        .set({ isDefault: true })
        .where(and(eq(llmCredentials.userId, user.id), eq(llmCredentials.provider, provider)));
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
    const user = await requireUser();
    const provider = String(formData.get("provider"));
    if (!isProviderId(provider)) return { error: "Unknown provider." };
    await db
      .delete(llmCredentials)
      .where(and(eq(llmCredentials.userId, user.id), eq(llmCredentials.provider, provider)));
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
    await db.insert(contactRequests).values({ ...parsed.data, userId: session?.user.id ?? null });
    return { ok: "Thanks — we read every message and usually reply within a day." };
  } catch (err) {
    return fail(err);
  }
}

/* --------------------------------------------------------------------- proxies */

const MAX_PROXIES = 20;

export async function addProxy(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
    const label = String(formData.get("label") ?? "").trim() || "Proxy";
    const tier = String(formData.get("tier") ?? "datacenter");
    const url = String(formData.get("url") ?? "").trim();
    if (tier !== "datacenter" && tier !== "residential") return { error: "Unknown proxy tier." };
    if (!url) return { error: "Paste the proxy URL from your provider." };

    const [{ count } = { count: 0 }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(userProxies)
      .where(eq(userProxies.userId, user.id));
    if (count >= MAX_PROXIES) return { error: `You can store up to ${MAX_PROXIES} proxies.` };

    // Validation and encryption both live in the runtime, so the API and the
    // dashboard cannot disagree about what a usable proxy URL is.
    const directory = proxyDirectory();
    const { encryptedUrl, urlHint } = directory.seal(url);

    await db.insert(userProxies).values({
      id: newId("prx"),
      userId: user.id,
      label: label.slice(0, 60),
      tier,
      encryptedUrl,
      urlHint,
    });
    directory.invalidate(user.id);
    revalidatePath("/dashboard/proxies");
    return { ok: `${label} added.` };
  } catch (err) {
    return fail(err);
  }
}

export async function setProxyActive(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
    const id = String(formData.get("id"));
    const active = String(formData.get("active")) === "true";
    await db
      .update(userProxies)
      // Re-enabling clears the failure count: the operator is saying it is fixed.
      .set({ active, ...(active ? { failures: 0 } : {}) })
      .where(and(eq(userProxies.id, id), eq(userProxies.userId, user.id)));
    proxyDirectory().invalidate(user.id);
    revalidatePath("/dashboard/proxies");
    return { ok: active ? "Proxy enabled." : "Proxy paused." };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteProxy(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
    const id = String(formData.get("id"));
    await db
      .delete(userProxies)
      .where(and(eq(userProxies.id, id), eq(userProxies.userId, user.id)));
    proxyDirectory().invalidate(user.id);
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
    const user = await requireUser();
    const id = String(formData.get("id"));
    const [row] = await db
      .select()
      .from(userProxies)
      .where(and(eq(userProxies.id, id), eq(userProxies.userId, user.id)));
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
    proxyDirectory().invalidate(user.id);
    revalidatePath("/dashboard/proxies");
    return result.ok
      ? { ok: `Working — exit IP ${result.ip}, ${Date.now() - started} ms.` }
      : { error: result.error };
  } catch (err) {
    return fail(err);
  }
}
