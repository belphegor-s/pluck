"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";

/**
 * A progress bar for route changes.
 *
 * The App Router exposes no navigation events, and `useLinkStatus` only reports
 * the link you are inside of, so the start of a navigation is detected the only
 * way available from outside: a click on an internal link, plus the history
 * methods the router calls for programmatic navigation. Arrival is whatever
 * renders next — a new pathname or query string.
 *
 * Nothing shows for the first 140ms, because a prefetched route arrives before
 * a bar would finish fading in, and a flash of progress reads as jank.
 */
const APPEAR_AFTER_MS = 140;
const DONE_LINGER_MS = 260;

function Progress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [progress, setProgress] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trickle = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimers = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    if (trickle.current) clearInterval(trickle.current);
    timer.current = null;
    trickle.current = null;
  }, []);

  const start = useCallback(() => {
    stopTimers();
    timer.current = setTimeout(() => {
      setProgress(12);
      // Creep towards, but never reach, the end: arrival finishes the bar.
      trickle.current = setInterval(() => {
        setProgress((p) => (p === null ? p : Math.min(p + (92 - p) * 0.12, 92)));
      }, 220);
    }, APPEAR_AFTER_MS);
  }, [stopTimers]);

  const finish = useCallback(() => {
    stopTimers();
    setProgress((p) => (p === null ? null : 100));
    timer.current = setTimeout(() => setProgress(null), DONE_LINGER_MS);
  }, [stopTimers]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.(
        "a[href]",
      ) as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      let url: URL;
      try {
        url = new URL(anchor.href);
      } catch {
        return;
      }
      // A different origin leaves the app; the same URL, or a bare hash, is not
      // a navigation at all.
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      start();
    };

    // `router.push` and friends go through the History API rather than a click.
    const patch = (name: "pushState" | "replaceState") => {
      const original = history[name];
      history[name] = function patched(this: History, ...args: Parameters<History["pushState"]>) {
        start();
        return original.apply(this, args);
      } as History[typeof name];
      return () => {
        history[name] = original;
      };
    };

    document.addEventListener("click", onClick, { capture: true });
    window.addEventListener("popstate", start);
    const restorePush = patch("pushState");
    const restoreReplace = patch("replaceState");

    return () => {
      document.removeEventListener("click", onClick, { capture: true });
      window.removeEventListener("popstate", start);
      restorePush();
      restoreReplace();
      stopTimers();
    };
  }, [start, stopTimers]);

  // The new route has rendered, so whatever was in flight has landed.
  const landed = `${pathname}?${search}`;
  const first = useRef(true);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the URL is the signal, not `finish`.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    finish();
  }, [landed]);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5"
      style={{ opacity: progress === null ? 0 : 1, transition: "opacity 200ms linear" }}
    >
      <div
        className="h-full bg-[var(--accent)]"
        style={{
          width: `${progress ?? 0}%`,
          transition:
            progress === 100 ? "width 180ms ease-out" : "width 400ms cubic-bezier(.2,.9,.25,1)",
          boxShadow: "0 0 8px color-mix(in srgb, var(--accent) 60%, transparent)",
        }}
      />
    </div>
  );
}

/** `useSearchParams` needs a Suspense boundary to keep pages statically rendered. */
export function NavigationProgress() {
  return (
    <Suspense fallback={null}>
      <Progress />
    </Suspense>
  );
}
