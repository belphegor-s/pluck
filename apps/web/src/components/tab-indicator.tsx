"use client";

import { useLayoutEffect, useRef } from "react";

/** Whatever marks the current item in a group, across the patterns this app uses. */
const CURRENT = '[aria-selected="true"], [aria-pressed="true"], [aria-current="page"]';

/**
 * Where an indicator was last seen, by group. A group whose page remounts on
 * navigation (the docs sidebar) starts from here, so it still glides from the
 * old item to the new one instead of appearing in place.
 */
const memory = new Map<string, Box>();

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The mark under the current tab, drawn once per group and moved between items
 * instead of being repainted on each one, so a switch reads as one thing
 * travelling rather than two things blinking.
 *
 * Drop it inside the group's container, which must be `relative isolate` (the
 * indicator sits at z-index -1, under the items but over the container's own
 * background). It finds the current item itself, so it works the same for
 * client state and for server-rendered links, and follows it through resizes,
 * font loads and a folding sidebar.
 *
 * Until it has measured, the current item keeps painting its own fill, so the
 * first paint, and a browser without JavaScript, still show which one it is.
 * Once ready it marks that item with `data-indicator-active`, and globals.css
 * clears the item's fill so the two never double up. Elements inside an item
 * that only exist to mark it (a side bar, say) take `tab-mark` and hide too.
 */
export function TabIndicator({
  variant = "fill",
  thickness = 2,
  selector = CURRENT,
  remember,
  className = "",
}: {
  /** fill: the item's whole box. underline: its bottom edge. rail: the group's left edge, beside it. */
  variant?: "fill" | "underline" | "rail";
  /** Line weight in px for underline and rail. */
  thickness?: number;
  /** How to find the current item inside the group. */
  selector?: string;
  /** A key to carry the position across a remount. */
  remember?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  // Read once, on the first render, before this instance has written its own.
  const resume = useRef<Box | null>(remember ? (memory.get(remember) ?? null) : null);
  // Where the mark is now. Kept outside the effect so a re-run (Strict Mode,
  // or a hidden route being shown again) knows it is already in place.
  const placed = useRef<Box | null>(null);

  useLayoutEffect(() => {
    const mark = ref.current;
    const group = mark?.parentElement;
    if (!mark || !group) return;

    let current: HTMLElement | null = null;

    const same = (a: Box | null, b: Box) =>
      a !== null && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

    const write = (box: Box) => {
      mark.style.setProperty("--tx", `${box.x}px`);
      mark.style.setProperty("--ty", `${box.y}px`);
      mark.style.setProperty("--tw", `${box.w}px`);
      mark.style.setProperty("--th", `${box.h}px`);
      placed.current = box;
      if (remember) memory.set(remember, box);
    };

    /** Lands on a box with no transition, committed before anything else moves it. */
    const jump = (box: Box) => {
      mark.dataset.snap = "";
      write(box);
      void mark.offsetWidth;
      delete mark.dataset.snap;
    };

    const boxOf = (item: HTMLElement): Box => {
      const g = group.getBoundingClientRect();
      const r = item.getBoundingClientRect();
      // Scroll offsets keep the mark attached when the group itself scrolls.
      const x = r.left - g.left - group.clientLeft + group.scrollLeft;
      const y = r.top - g.top - group.clientTop + group.scrollTop;
      if (variant === "underline")
        return { x, y: y + r.height - thickness, w: r.width, h: thickness };
      if (variant === "rail") return { x: 0, y, w: thickness, h: r.height };
      return { x, y, w: r.width, h: r.height };
    };

    const resize = new ResizeObserver(() => update(false));

    const update = (animate: boolean) => {
      const next = [...group.querySelectorAll<HTMLElement>(selector)].find(
        (el) => el !== mark && el.getClientRects().length > 0,
      );
      if (next !== current) {
        current?.removeAttribute("data-indicator-active");
        if (current) resize.unobserve(current);
        if (next) resize.observe(next);
        current = next ?? null;
      }
      if (!current) {
        mark.dataset.hidden = "";
        return;
      }
      current.setAttribute("data-indicator-active", "");
      group.dataset.indicator = "ready";
      const box = boxOf(current);
      const shown = !("hidden" in mark.dataset) && placed.current !== null;
      delete mark.dataset.hidden;

      // The first time a remounted group is on screen, start from where the
      // previous one left off. Not before: a route can mount while hidden, and
      // a transition needs a rendered starting point.
      const from = resume.current;
      if (from) {
        resume.current = null;
        jump(from);
        write(box);
        return;
      }
      // Observers fire for changes that move nothing (including the first
      // callback of a fresh observe); re-placing then would cut a glide short.
      if (shown && same(placed.current, box)) return;
      // Glide only between two real positions; a first sighting lands in place.
      if (animate && shown) write(box);
      else jump(box);
    };

    update(false);

    // State changes land as attribute or class changes on the items; radios
    // change a property, not an attribute, so `change` covers those.
    const mutations = new MutationObserver(() => update(true));
    mutations.observe(group, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["aria-selected", "aria-pressed", "aria-current", "class"],
    });
    const onChange = () => update(true);
    group.addEventListener("change", onChange);
    resize.observe(group);
    void document.fonts?.ready.then(() => update(false));

    return () => {
      mutations.disconnect();
      resize.disconnect();
      group.removeEventListener("change", onChange);
      current?.removeAttribute("data-indicator-active");
      delete group.dataset.indicator;
    };
  }, [variant, thickness, selector, remember]);

  return (
    <span ref={ref} aria-hidden="true" data-hidden="" className={`tab-indicator ${className}`} />
  );
}
