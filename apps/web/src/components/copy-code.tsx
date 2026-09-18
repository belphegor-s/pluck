"use client";

import { useEffect } from "react";

/**
 * Adds a copy button to every code block in server-rendered documentation.
 * The markdown is compiled to an HTML string at build time, so the button is
 * attached here rather than rendered into each block.
 */
export function CopyCodeButtons({ containerId }: { containerId: string }) {
  useEffect(() => {
    const container = document.getElementById(containerId);
    if (!container) return;

    const cleanups: (() => void)[] = [];
    for (const pre of container.querySelectorAll("pre")) {
      if (pre.dataset.copyReady) continue;
      pre.dataset.copyReady = "true";

      const wrapper = document.createElement("div");
      wrapper.className = "group relative";
      pre.parentNode?.insertBefore(wrapper, pre);
      wrapper.appendChild(pre);

      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Copy";
      button.setAttribute("aria-label", "Copy code to clipboard");
      button.className =
        "absolute right-2 top-2 border border-[var(--line)] bg-[var(--paper)] px-2 py-1 text-xs text-[var(--ink-soft)] opacity-0 transition-opacity hover:text-[var(--ink)] focus-visible:opacity-100 group-hover:opacity-100";

      const onClick = () => {
        void navigator.clipboard.writeText(pre.innerText.replace(/\n$/, "")).then(() => {
          button.textContent = "Copied";
          setTimeout(() => {
            button.textContent = "Copy";
          }, 1600);
        });
      };
      button.addEventListener("click", onClick);
      wrapper.appendChild(button);
      cleanups.push(() => button.removeEventListener("click", onClick));
    }
    return () => {
      for (const cleanup of cleanups) cleanup();
    };
  }, [containerId]);

  return null;
}
