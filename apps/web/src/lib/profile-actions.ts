"use server";

import { userAvatars, users } from "@pluck/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { encodeAvatar } from "@/lib/avatars";
import { db } from "@/lib/db";

export type ProfileState = { ok?: string; error?: string };

const fail = (error: unknown): ProfileState => ({
  error: error instanceof Error ? error.message : "Something went wrong.",
});

async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("Sign in to continue.");
  return session.user;
}

export async function updateName(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  try {
    const user = await requireUser();
    const name = String(formData.get("name") ?? "")
      // Control characters and runs of whitespace have no place in a display name.
      .replace(/[\p{Cc}\p{Cf}]/gu, "")
      .replace(/\s+/g, " ")
      .trim();
    if (name.length < 1) return { error: "Enter a name." };
    if (name.length > 80) return { error: "Keep your name under 80 characters." };
    await db.update(users).set({ name }).where(eq(users.id, user.id));
    revalidatePath("/dashboard", "layout");
    return { ok: "Name saved." };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Stores a new profile picture, re-encoded by `encodeAvatar`.
 */
export async function uploadAvatar(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  try {
    const user = await requireUser();
    const encoded = await encodeAvatar(formData.get("avatar"));
    if (!encoded.ok) return { error: encoded.error };
    const { data, hash } = encoded;

    await db.transaction(async (tx) => {
      const [current] = await tx
        .select({ image: users.image, previous: userAvatars.previousImage })
        .from(users)
        .leftJoin(userAvatars, eq(userAvatars.userId, users.id))
        .where(eq(users.id, user.id));
      // Remember the picture from before the first upload, so removing ours
      // brings it back rather than leaving an empty circle.
      const own = current?.image?.startsWith("/api/avatar/") ?? false;
      const previousImage = own ? (current?.previous ?? null) : (current?.image ?? null);
      await tx
        .insert(userAvatars)
        .values({ userId: user.id, data, contentType: "image/webp", hash, previousImage })
        .onConflictDoUpdate({
          target: userAvatars.userId,
          set: { data, contentType: "image/webp", hash, updatedAt: new Date() },
        });
      await tx
        .update(users)
        .set({ image: `/api/avatar/${user.id}?v=${hash}` })
        .where(eq(users.id, user.id));
    });
    revalidatePath("/dashboard", "layout");
    return { ok: "Picture updated." };
  } catch (err) {
    return fail(err);
  }
}

export async function removeAvatar(
  _prev: ProfileState,
  _formData: FormData,
): Promise<ProfileState> {
  try {
    const user = await requireUser();
    await db.transaction(async (tx) => {
      const [row] = await tx
        .select({ previous: userAvatars.previousImage })
        .from(userAvatars)
        .where(eq(userAvatars.userId, user.id));
      if (!row) return;
      await tx.delete(userAvatars).where(eq(userAvatars.userId, user.id));
      await tx.update(users).set({ image: row.previous }).where(eq(users.id, user.id));
    });
    revalidatePath("/dashboard", "layout");
    return { ok: "Picture removed." };
  } catch (err) {
    return fail(err);
  }
}
