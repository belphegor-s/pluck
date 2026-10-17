"use client";

import { useEffect, useState } from "react";

/** Matches the closing animations in globals.css (`[data-state="closed"]`). */
export const EXIT_MS = 160;

/**
 * Keeps something on screen long enough to animate out.
 *
 * Conditional rendering removes a menu the instant it closes, so only the
 * opening can ever be animated. This holds it mounted for the length of the
 * closing animation and reports which way it is going; the element carries
 * `data-state={state}` and globals.css does the rest. Opening is immediate:
 * `mounted` is true on the same render that `open` is.
 */
export function usePresence(open: boolean, exitMs = EXIT_MS) {
  const [lingering, setLingering] = useState(open);

  useEffect(() => {
    if (open) {
      setLingering(true);
      return;
    }
    if (!lingering) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = setTimeout(() => setLingering(false), reduced ? 0 : exitMs);
    return () => clearTimeout(timer);
  }, [open, lingering, exitMs]);

  return { mounted: open || lingering, state: open ? "open" : "closed" } as const;
}
