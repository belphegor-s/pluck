import {
  type Account,
  DEFAULT_SETTINGS,
  type HistoryEntry,
  type Intent,
  type Settings,
  type Target,
} from "./types";

/**
 * `local` survives restarts and stays on this device (the key lives here).
 * `session` is in memory only and is gone when the browser closes, which is
 * where a sign-in in progress and the current tab belong.
 */
type Area = "local" | "session";

export async function read<T>(area: Area, key: string): Promise<T | undefined> {
  const found = await chrome.storage[area].get(key);
  return found[key] as T | undefined;
}

export async function write(area: Area, key: string, value: unknown): Promise<void> {
  await chrome.storage[area].set({ [key]: value });
}

export async function remove(area: Area, key: string): Promise<void> {
  await chrome.storage[area].remove(key);
}

/** Calls `fn` whenever `key` changes in `area`, from any part of the extension. */
export function watch<T>(area: Area, key: string, fn: (value: T | undefined) => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, name: string) => {
    if (name === area && key in changes) fn(changes[key]?.newValue as T | undefined);
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

export const KEYS = {
  account: "account",
  settings: "settings",
  history: "history",
  installId: "installId",
  connect: "connect",
  target: (windowId: number) => `target:${windowId}`,
  intent: (windowId: number) => `intent:${windowId}`,
} as const;

export const getAccount = () => read<Account>("local", KEYS.account);

export async function getSettings(): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...(await read<Partial<Settings>>("local", KEYS.settings)) };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await write("local", KEYS.settings, next);
  return next;
}

export const setTarget = (windowId: number, target: Target) =>
  write("session", KEYS.target(windowId), target);

export const setIntent = (windowId: number, intent: Intent) =>
  write("session", KEYS.intent(windowId), intent);

const HISTORY_LIMIT = 25;
/** Outputs larger than this are listed but not kept: storage is 10 MB in all. */
const HISTORY_TEXT_LIMIT = 150_000;

export async function addHistory(entry: HistoryEntry): Promise<void> {
  const settings = await getSettings();
  if (!settings.keepHistory) return;
  const kept =
    entry.text && entry.text.length > HISTORY_TEXT_LIMIT ? { ...entry, text: undefined } : entry;
  const history = (await read<HistoryEntry[]>("local", KEYS.history)) ?? [];
  await write("local", KEYS.history, [kept, ...history].slice(0, HISTORY_LIMIT));
}

export const clearHistory = () => remove("local", KEYS.history);

/** Four hex characters that tell this browser's key apart from another's. */
export async function installSuffix(): Promise<string> {
  let id = await read<string>("local", KEYS.installId);
  if (!id) {
    id = Array.from(crypto.getRandomValues(new Uint8Array(2)), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
    await write("local", KEYS.installId, id);
  }
  return id;
}
