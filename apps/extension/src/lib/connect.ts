import type { ExtensionTokenResponse } from "@pluck/shared";
import { call } from "./api";
import { CONFIG } from "./config";
import { challengeFor, randomToken } from "./pkce";
import { getAccount, installSuffix, KEYS, read, remove, write } from "./storage";
import type { Account } from "./types";

/**
 * Signing in. Accounts are made on the site and nowhere else, so the
 * extension never sees a password or a session: it opens the site's connect
 * page, the person approves there, and the page hands back a one-time code.
 *
 * The code alone is useless. It is exchanged together with a verifier that was
 * generated here and kept in session storage (memory only), and whose hash the
 * site was given up front. That is PKCE, and it means nothing that can read
 * the page or the URL can finish the sign-in in the extension's place.
 */
interface Pending {
  state: string;
  verifier: string;
  startedAt: number;
  /** The tab to go back to once connected. */
  returnTabId?: number;
}

const PENDING_TTL_MS = 15 * 60 * 1000;

const SYSTEMS: Record<string, string> = {
  win: "Windows",
  mac: "macOS",
  linux: "Linux",
  cros: "ChromeOS",
  android: "Android",
};

/** Names this browser's key in the dashboard, such as "Windows 4f2a". */
export async function deviceLabel(): Promise<string> {
  const { os } = await chrome.runtime.getPlatformInfo();
  return `${SYSTEMS[os] ?? "Browser"} ${await installSuffix()}`;
}

/** Opens the site's connect page in a new tab and remembers what to expect back. */
export async function beginConnect(): Promise<void> {
  const verifier = randomToken(32);
  const state = randomToken(16);
  const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const pending: Pending = { state, verifier, startedAt: Date.now(), returnTabId: active?.id };
  await write("session", KEYS.connect, pending);

  const url = new URL("/extension/connect", CONFIG.siteUrl);
  url.searchParams.set("ext", chrome.runtime.id);
  url.searchParams.set("challenge", await challengeFor(verifier));
  url.searchParams.set("state", state);
  url.searchParams.set("device", await deviceLabel());
  await chrome.tabs.create({ url: url.href });
}

/**
 * Finishes a sign-in with the code the connect page sent. Called by the
 * background worker, which has already checked the message came from the site.
 */
export async function completeConnect(
  code: unknown,
  state: unknown,
): Promise<{ account: Account; returnTabId?: number }> {
  const pending = await read<Pending>("session", KEYS.connect);
  if (
    typeof code !== "string" ||
    typeof state !== "string" ||
    !pending ||
    pending.state !== state ||
    Date.now() - pending.startedAt > PENDING_TTL_MS
  )
    throw new Error(
      "This sign-in was not started from this browser, or it has expired. Choose Connect in the extension again.",
    );
  // One attempt per request, whatever happens next.
  await remove("session", KEYS.connect);

  let res: Response;
  try {
    res = await fetch(new URL("/api/extension/token", CONFIG.siteUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, verifier: pending.verifier }),
      credentials: "omit",
      cache: "no-store",
    });
  } catch {
    throw new Error("The extension could not reach the site to finish signing in.");
  }
  const payload = (await res.json().catch(() => null)) as
    | (Partial<ExtensionTokenResponse> & { error?: string })
    | null;
  if (!res.ok || !payload?.apiKey || !payload.apiUrl)
    throw new Error(payload?.error ?? "The site did not accept the sign-in. Try again.");

  const account: Account = {
    apiKey: payload.apiKey,
    apiUrl: payload.apiUrl,
    via: "connect",
    workspace: payload.workspace,
    user: payload.user,
    connectedAt: Date.now(),
  };
  await write("local", KEYS.account, account);
  return { account, returnTabId: pending.returnTabId };
}

/** Normalises an instance address typed by hand; null when it is not a web URL. */
export function normalizeApiUrl(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  try {
    // A bare host gets https; any scheme that was typed is taken at its word.
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return (url.origin + url.pathname).replace(/\/+$/, "");
  } catch {
    return null;
  }
}

/**
 * Uses a key pasted into settings: the way in for a self-hosted instance, which
 * may have no sign-in at all. The key is checked against the API before it is
 * saved. Throws `ApiError` when the instance refuses it.
 */
export async function connectWithKey(apiUrl: string, apiKey: string): Promise<Account> {
  const credentials = { apiUrl, apiKey: apiKey.trim() };
  await call(credentials, "usage", { days: 1 }, { timeoutMs: 20_000 });
  const account: Account = { ...credentials, via: "key", connectedAt: Date.now() };
  await write("local", KEYS.account, account);
  return account;
}

/**
 * Forgets the account. A key the site issued is revoked there as well, so it
 * does not go on working with nobody holding it; a pasted key is the person's
 * own and is left alone.
 */
export async function disconnect(): Promise<void> {
  const account = await getAccount();
  if (!account) return;
  await remove("local", KEYS.account);
  if (account.via !== "connect") return;
  await fetch(new URL("/api/extension/revoke", CONFIG.siteUrl), {
    method: "POST",
    headers: { authorization: `Bearer ${account.apiKey}` },
    credentials: "omit",
    cache: "no-store",
  }).catch(() => {});
}
