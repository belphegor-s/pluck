"use server";

import { isProviderId, keyHint, SecretBox } from "@pluck/ai";
import { assertPublicUrl } from "@pluck/core";
import { apiKeys, contactRequests, llmCredentials, newId } from "@pluck/db";
import { generateApiKey } from "@pluck/runtime";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

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
