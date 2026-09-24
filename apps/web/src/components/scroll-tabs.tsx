"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A single row of tabs that scrolls sideways instead of wrapping.
 *
 * Wrapping tabs change the height of the page as the list grows and bury the
 * last item on a second line; a rail keeps the row one line tall at every
 * width. Arrows appear only on the side that has something left to reach, and
 * the edge fades say "there is more" without drawing a scrollbar.
 */
export function ScrollTabs({
  children,
  className = "",
  label,
}: {
  children: React.ReactNode;
  className?: string;
  label: string;
}) {
  const rail = useRef<HTMLDivElement | null>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = rail.current;
    if (!el) return;
    // A one-pixel slack: fractional layout widths never land exactly on zero.
    const left = el.scrollLeft > 1;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setEdges((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
  }, []);

  useEffect(() => {
    const el = rail.current;
    if (!el) return;
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    // Fonts landing or the window changing both change what fits.
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    for (const child of el.children) observer.observe(child);
    return () => {
      el.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [measure]);

  // Bring the current tab into view on load, without scrolling the page itself.
  useEffect(() => {
    const el = rail.current;
    const current = el?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!el || !current) return;
    const offset = current.offsetLeft - (el.clientWidth - current.offsetWidth) / 2;
    el.scrollLeft = Math.max(0, offset);
  }, []);

  const nudge = (direction: -1 | 1) => {
    const el = rail.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({
      left: direction * el.clientWidth * 0.8,
      behavior: reduced ? "auto" : "smooth",
    });
  };

  return (
    <div className={`relative ${className}`}>
      <div
        ref={rail}
        // `overscroll-x-contain` stops a sideways flick from triggering the
        // browser's back gesture.
        className="no-scrollbar flex snap-x gap-2 overflow-x-auto overscroll-x-contain scroll-smooth"
      >
        {children}
      </div>

      <Edge
        side="left"
        shown={edges.left}
        onClick={() => nudge(-1)}
        label={`Scroll ${label} left`}
      />
      <Edge
        side="right"
        shown={edges.right}
        onClick={() => nudge(1)}
        label={`Scroll ${label} right`}
      />
    </div>
  );
}

function Edge({
  side,
  shown,
  onClick,
  label,
}: {
  side: "left" | "right";
  shown: boolean;
  onClick: () => void;
  label: string;
}) {
  const isLeft = side === "left";
  return (
    <div
      className={`pointer-events-none absolute inset-y-0 flex items-center transition-opacity duration-150 ${
        isLeft ? "left-0 justify-start pr-8" : "right-0 justify-end pl-8"
      } ${shown ? "opacity-100" : "opacity-0"}`}
      style={{
        // The fade is the same colour as the surface behind the rail, so the
        // row appears to dissolve rather than sit on a coloured block.
        background: `linear-gradient(to ${isLeft ? "right" : "left"}, var(--tabs-fade, var(--paper)) 45%, transparent)`,
      }}
    >
      <button
        type="button"
        aria-label={label}
        tabIndex={shown ? 0 : -1}
        aria-hidden={!shown}
        onClick={onClick}
        className={`pointer-events-auto flex size-7 shrink-0 items-center justify-center border border-[var(--line)] bg-[var(--paper)] text-[var(--ink-soft)] transition-colors hover:border-[var(--ink)] hover:text-[var(--ink)] ${
          shown ? "" : "pointer-events-none"
        }`}
      >
        {isLeft ? (
          <ChevronLeft aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
        ) : (
          <ChevronRight aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
        )}
      </button>
    </div>
  );
}
