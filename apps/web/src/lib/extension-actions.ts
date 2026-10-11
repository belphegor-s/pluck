"use server";

import { extensionConnectParams } from "@pluck/shared";
import { z } from "zod";
import {
  activeKeyCount,
  isAllowedExtension,
  issueExtensionCode,
  MAX_WORKSPACE_KEYS,
} from "@/lib/extension";
import { getSessionUser, membership } from "@/lib/workspace";

const approval = extensionConnectParams.extend({
  orgId: z.string().regex(/^[\w-]{1,64}$/),
});

/**
 * The user pressed Connect. Returns a one-time code for the page to pass to
 * the extension; the API key itself is only ever sent to the extension, in
 * exchange for this code and a verifier the page never sees.
 */
export async function authorizeExtension(
  input: unknown,
): Promise<{ code?: string; error?: string }> {
  const parsed = approval.safeParse(input);
  if (!parsed.success)
    return { error: "This connect link is not valid. Start again from the extension." };
  const { orgId, ext, challenge, device } = parsed.data;

  const user = await getSessionUser();
  if (!user) return { error: "Your session ended. Reload the page and sign in again." };
  if (!isAllowedExtension(ext)) return { error: "This extension is not allowed to sign in here." };
  if (!(await membership(orgId, user.id)))
    return { error: "You are not a member of that workspace." };
  // One more key than the limit is fine here: reconnecting replaces this
  // browser's previous key, and the exchange enforces the limit for real.
  if ((await activeKeyCount(orgId)) > MAX_WORKSPACE_KEYS)
    return { error: "This workspace has too many API keys. Revoke one in the dashboard first." };

  return { code: await issueExtensionCode({ userId: user.id, orgId, ext, challenge, device }) };
}
