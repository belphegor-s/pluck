import type { ResponseMeta } from "@pluck/shared";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { call, explain, isAbort, type Problem } from "../lib/api";
import { CaptureError, describeTab } from "../lib/page";
import { KEYS, read, remove, setTarget, watch } from "../lib/storage";
import {
  type Account,
  DEFAULT_SETTINGS,
  type HistoryEntry,
  type Intent,
  type Settings,
  type Target,
} from "../lib/types";

/** A value in extension storage, kept current as any part of the extension changes it. */
export function useStored<T>(
  area: "local" | "session",
  key: string | null,
  fallback: T,
): [T, boolean] {
  const [value, setValue] = useState<T>(fallback);
  const [loaded, setLoaded] = useState(false);
  const initial = useRef(fallback);

  useEffect(() => {
    if (!key) return;
    let live = true;
    void read<T>(area, key).then((stored) => {
      if (!live) return;
      setValue(stored ?? initial.current);
      setLoaded(true);
    });
    const stop = watch<T>(area, key, (next) => setValue(next ?? initial.current));
    return () => {
      live = false;
      stop();
    };
  }, [area, key]);

  return [value, loaded];
}

export const useAccount = () => useStored<Account | null>("local", KEYS.account, null);

export function useSettings(): Settings {
  const [stored] = useStored<Partial<Settings>>("local", KEYS.settings, {});
  return { ...DEFAULT_SETTINGS, ...stored };
}

export const useHistory = () => useStored<HistoryEntry[]>("local", KEYS.history, [])[0];

/** The browser window this panel belongs to. */
export function useWindowId(): number | null {
  const [id, setId] = useState<number | null>(null);
  useEffect(() => {
    void chrome.windows.getCurrent().then((win) => setId(win.id ?? null));
  }, []);
  return id;
}

/**
 * The tab Pluck is pointed at.
 *
 * The extension can only see a tab's address once it has been invoked there
 * (that is what `activeTab` means), so after a switch to a tab it has not been
 * opened on, the target has a tab id and no URL, and the panel asks for a
 * click. With the optional "follow tabs" permission every tab is visible and
 * the target simply tracks the one in front.
 */
export function useTarget(windowId: number | null): Target | null {
  const [stored] = useStored<Target | null>(
    "session",
    windowId === null ? null : KEYS.target(windowId),
    null,
  );
  const [live, setLive] = useState<Target | null>(null);

  useEffect(() => {
    if (windowId === null) return;
    let current = true;
    const refresh = async () => {
      const [tab] = await chrome.tabs.query({ active: true, windowId });
      if (!current || !tab) return;
      const next = describeTab(tab);
      setLive(next);
      // Remembered so the panel still knows the tab if it is closed and reopened.
      if (next.url) void setTarget(windowId, next);
    };
    void refresh();

    const onActivated = (info: { windowId: number }) => {
      if (info.windowId === windowId) void refresh();
    };
    const onUpdated = (
      _id: number,
      change: { status?: string; url?: string; title?: string },
      tab: chrome.tabs.Tab,
    ) => {
      if (tab.windowId === windowId && tab.active && (change.status || change.url || change.title))
        void refresh();
    };
    chrome.tabs.onActivated.addListener(onActivated);
    chrome.tabs.onUpdated.addListener(onUpdated);
    return () => {
      current = false;
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };
  }, [windowId]);

  // The background writes the target the moment Pluck is invoked on a tab,
  // which is also when that tab becomes readable; prefer it when it is the
  // same tab and carries the address the live query could not see.
  if (live && !live.url && stored?.url && stored.tabId === live.tabId) return stored;
  return live ?? stored;
}

/** Delivers each request from the background (menu click, shortcut) once. */
export function useIntent(windowId: number | null, onIntent: (intent: Intent) => void): void {
  const handler = useRef(onIntent);
  handler.current = onIntent;
  useEffect(() => {
    if (windowId === null) return;
    const key = KEYS.intent(windowId);
    const take = (intent: Intent | undefined) => {
      if (!intent) return;
      void remove("session", key);
      handler.current(intent);
    };
    void read<Intent>("session", key).then(take);
    return watch<Intent>("session", key, take);
  }, [windowId]);
}

export interface Usage {
  /** Credits left; null on an instance without billing; undefined until known. */
  balance: number | null | undefined;
  problem: Problem | null;
  refresh: () => void;
}

export function useUsage(account: Account | null): Usage {
  const [balance, setBalance] = useState<number | null | undefined>(undefined);
  const [problem, setProblem] = useState<Problem | null>(null);
  const key = account ? `${account.apiUrl}|${account.apiKey}` : null;
  const latest = useRef(account);
  latest.current = account;

  // biome-ignore lint/correctness/useExhaustiveDependencies: refetch only when the credentials change
  const refresh = useCallback(() => {
    const current = latest.current;
    if (!current) return;
    call(current, "usage", { days: 1 }, { timeoutMs: 20_000 }).then(
      ({ data }) => {
        if (latest.current !== current) return;
        setBalance(data.balance);
        setProblem(null);
      },
      (err: unknown) => {
        if (latest.current !== current || isAbort(err)) return;
        setProblem(explain(err));
      },
    );
  }, [key]);

  useEffect(() => {
    setBalance(undefined);
    setProblem(null);
    refresh();
    const onFocus = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onFocus);
    return () => document.removeEventListener("visibilitychange", onFocus);
  }, [refresh]);

  return { balance, problem, refresh };
}

/** What every tool can reach. */
export interface PanelContext {
  account: Account;
  settings: Settings;
  target: Target | null;
  /** False on a self-hosted instance with billing off: prices are hidden. */
  billing: boolean;
  refreshUsage: () => void;
  record: (entry: Omit<HistoryEntry, "id" | "at">) => void;
  /** A pending request for the open tool, handed over once. */
  intent: Intent | null;
  consumeIntent: () => void;
  reconnect: () => void;
  /** Back to the tool list. */
  back: () => void;
}

export const Panel = createContext<PanelContext | null>(null);

export function usePanel(): PanelContext {
  const ctx = useContext(Panel);
  if (!ctx) throw new Error("usePanel outside the panel");
  return ctx;
}

export type Run<T> =
  | { status: "idle" }
  | { status: "running" }
  | { status: "done"; value: T; meta: ResponseMeta | null }
  | { status: "error"; problem: Problem };

function describe(err: unknown): Problem {
  if (!(err instanceof CaptureError)) return explain(err);
  switch (err.reason) {
    case "restricted":
      return {
        title: "The browser keeps this page private",
        detail:
          "Extensions are never allowed to read browser pages, the extension store or the PDF viewer. Fetching the address instead may still work.",
      };
    case "empty":
      return {
        title: "Nothing to read here",
        detail: "The page had no visible text. If it is still loading, wait and try again.",
      };
    default:
      return {
        title: "Open Pluck on this tab first",
        detail:
          "Click the Pluck button in the toolbar, or press Alt+Shift+P, while this tab is in front. That is what lets Pluck read the page, and only this page.",
      };
  }
}

/** One cancellable job at a time, with its outcome as state. */
export function useRun<T>() {
  const [run, setRun] = useState<Run<T>>({ status: "idle" });
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  const start = useCallback(
    async (job: (signal: AbortSignal) => Promise<{ value: T; meta: ResponseMeta | null }>) => {
      controller.current?.abort();
      const mine = new AbortController();
      controller.current = mine;
      setRun({ status: "running" });
      try {
        const out = await job(mine.signal);
        if (!mine.signal.aborted) setRun({ status: "done", ...out });
      } catch (err) {
        if (mine.signal.aborted || isAbort(err)) return;
        setRun({ status: "error", problem: describe(err) });
      }
    },
    [],
  );

  const cancel = useCallback(() => {
    controller.current?.abort();
    setRun({ status: "idle" });
  }, []);

  return { run, start, cancel };
}
