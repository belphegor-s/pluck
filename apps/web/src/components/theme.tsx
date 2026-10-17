"use client";

import { Moon, Sun } from "lucide-react";
import { ThemeProvider as NextThemes, useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemes attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </NextThemes>
  );
}

const WAVE_MS = 820;
/** Polygon points around the front; enough that the crests stay smooth at full size. */
const POINTS = 144;
/** Keyframes along the way. Easing is baked into them, so they play linearly. */
const STEPS = 36;

/**
 * The new theme washes over the old one from the button: a wavefront whose
 * crests swell as it travels, drift around it, and flatten out as it reaches
 * the far corner, so the last frame is a plain full-screen cover.
 *
 * Drawn as a clip-path polygon on the View Transitions snapshot of the new
 * page. Every frame has the same number of points, so the browser can
 * interpolate between them, and clip-path animates on the compositor.
 */
function waveFrames(x: number, y: number, width: number, height: number) {
  const reach = Math.hypot(Math.max(x, width - x), Math.max(y, height - y));
  const crest = Math.min(64, reach * 0.05);
  const frames: string[] = [];
  for (let step = 0; step <= STEPS; step++) {
    const t = step / STEPS;
    // Ease in-out on the radius: the area grows with its square, so a gentle
    // start still reads as the wave leaving the button quickly.
    const eased = -(Math.cos(Math.PI * t) - 1) / 2;
    const radius = (reach + crest) * eased;
    const swell = crest * Math.sin(Math.PI * t);
    const drift = t * Math.PI * 2.2;
    const points: string[] = [];
    for (let i = 0; i < POINTS; i++) {
      const a = (i / POINTS) * Math.PI * 2;
      const r = Math.max(
        0,
        radius + swell * (0.72 * Math.sin(7 * a + drift) + 0.28 * Math.sin(12 * a - drift * 1.5)),
      );
      points.push(`${(x + r * Math.cos(a)).toFixed(1)}px ${(y + r * Math.sin(a)).toFixed(1)}px`);
    }
    frames.push(`polygon(${points.join(",")})`);
  }
  return frames;
}

/** Switches the page's theme classes on the spot, without any transition catching them halfway. */
function applyTheme(next: "light" | "dark", setTheme: (theme: string) => void) {
  const root = document.documentElement;
  // Added only now, after the old page has been captured, so the outgoing
  // snapshot still shows the old icon at rest. The icon turns over as it lands.
  root.classList.add("theme-switching");
  const freeze = document.createElement("style");
  freeze.textContent = "*,*::before,*::after{transition:none!important}";
  document.head.appendChild(freeze);
  root.classList.remove("light", "dark");
  root.classList.add(next);
  root.style.colorScheme = next;
  // next-themes stores the choice and would apply the same class in an effect;
  // doing both here means the new snapshot is taken in the new theme.
  flushSync(() => setTheme(next));
  void window.getComputedStyle(document.body).color;
  return () => freeze.remove();
}

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const button = useRef<HTMLButtonElement | null>(null);
  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === "dark";

  const toggle = () => {
    const next = document.documentElement.classList.contains("dark") ? "light" : "dark";
    const root = document.documentElement;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const settle = () => root.classList.remove("theme-switching");

    if (reduced || typeof document.startViewTransition !== "function") {
      applyTheme(next, setTheme)();
      setTimeout(settle, 600);
      return;
    }

    const box = button.current?.getBoundingClientRect();
    const x = box ? box.left + box.width / 2 : window.innerWidth - 40;
    const y = box ? box.top + box.height / 2 : 28;

    let thaw = () => {};
    root.classList.add("theme-wave");
    const transition = document.startViewTransition(() => {
      thaw = applyTheme(next, setTheme);
    });
    transition.ready
      .then(() => {
        root.animate(
          { clipPath: waveFrames(x, y, window.innerWidth, window.innerHeight) },
          {
            duration: WAVE_MS,
            easing: "linear",
            pseudoElement: "::view-transition-new(root)",
          },
        );
      })
      .catch(() => {});
    transition.finished
      .finally(() => {
        thaw();
        root.classList.remove("theme-wave");
        settle();
      })
      .catch(() => {});
  };

  return (
    <button
      ref={button}
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Light theme" : "Dark theme"}
      className="relative grid h-8 w-8 place-items-center overflow-hidden border border-[var(--line)] text-[var(--ink-soft)] transition-colors hover:border-[var(--ink-faint)] hover:text-[var(--ink)]"
    >
      {/* Both icons are drawn; the class next-themes puts on <html> before
          first paint picks one, so there is no wrong icon while hydrating. */}
      <Sun
        aria-hidden="true"
        className="theme-icon theme-icon-sun size-[15px]"
        strokeWidth={1.75}
      />
      <Moon
        aria-hidden="true"
        className="theme-icon theme-icon-moon size-[15px]"
        strokeWidth={1.75}
      />
    </button>
  );
}
