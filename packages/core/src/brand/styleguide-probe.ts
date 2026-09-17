import type { Styleguide } from "@pluck/shared";

/**
 * Runs inside the rendered page (serialised by Playwright), so it must be
 * fully self-contained: no imports, no closures over module scope.
 */
export function styleguideProbe(): Omit<Styleguide, "url"> {
  const toHex = (c: string): string | null => {
    const m = c.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+%?))?\s*\)/);
    if (!m) return null;
    const alpha = m[4] === undefined ? 1 : m[4].endsWith("%") ? Number.parseFloat(m[4]) / 100 : Number(m[4]);
    if (alpha < 0.5) return null;
    return `#${[m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, "0")).join("")}`;
  };
  const isNeutral = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
    return Math.max(r, g, b) - Math.min(r, g, b) < 18;
  };
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.top < window.innerHeight * 4;
  };
  const pick = (s: CSSStyleDeclaration, props: string[]) =>
    Object.fromEntries(props.map((p) => [p, s.getPropertyValue(p)]).filter(([, v]) => v && v !== "none" && v !== "normal" && v !== "0px"));

  const palette = new Map<string, number>();
  const fonts = new Map<string, Set<string>>();
  const radii = new Map<string, number>();
  const shadows = new Map<string, number>();
  const spacing = new Map<string, number>();

  const elements = Array.from(document.querySelectorAll("body *")).slice(0, 4000);
  for (const el of elements) {
    if (!visible(el)) continue;
    const s = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const area = Math.min(rect.width * rect.height, 500_000);
    const bg = toHex(s.backgroundColor);
    if (bg) palette.set(bg, (palette.get(bg) ?? 0) + area / 1000);
    const fg = el.childNodes.length && el.textContent?.trim() ? toHex(s.color) : null;
    if (fg) palette.set(fg, (palette.get(fg) ?? 0) + 5);
    const border = s.borderTopWidth !== "0px" ? toHex(s.borderTopColor) : null;
    if (border) palette.set(border, (palette.get(border) ?? 0) + 1);

    if (el.textContent?.trim()) {
      const family = s.fontFamily.split(",")[0]!.replace(/["']/g, "").trim();
      const tag = el.tagName.toLowerCase();
      if (!fonts.has(family)) fonts.set(family, new Set());
      if (/^h[1-6]$/.test(tag)) fonts.get(family)!.add("heading");
      else if (tag === "code" || tag === "pre") fonts.get(family)!.add("code");
      else if (tag === "button" || tag === "a") fonts.get(family)!.add("ui");
      else fonts.get(family)!.add("body");
    }
    if (s.borderTopLeftRadius !== "0px") radii.set(s.borderTopLeftRadius, (radii.get(s.borderTopLeftRadius) ?? 0) + 1);
    if (s.boxShadow !== "none") shadows.set(s.boxShadow, (shadows.get(s.boxShadow) ?? 0) + 1);
    for (const p of [s.paddingTop, s.paddingLeft, s.gap, s.marginBottom]) {
      if (p && p !== "0px" && p !== "normal" && p.endsWith("px")) spacing.set(p, (spacing.get(p) ?? 0) + 1);
    }
  }

  const bodyStyle = getComputedStyle(document.body);
  const background = toHex(bodyStyle.backgroundColor) ?? toHex(getComputedStyle(document.documentElement).backgroundColor) ?? "#ffffff";
  const foreground = toHex(bodyStyle.color);

  const button = Array.from(document.querySelectorAll("button, a[class*='btn' i], a[class*='button' i], [role='button']")).find(visible);
  const buttonStyle = button ? getComputedStyle(button) : null;
  const link = Array.from(document.querySelectorAll("main a, article a, p a")).find(visible) ?? document.querySelector("a");
  const input = Array.from(document.querySelectorAll("input[type='text'], input[type='email'], input:not([type]), textarea")).find(visible);

  const ranked = [...palette.entries()].sort((a, b) => b[1] - a[1]);
  const chromatic = ranked.filter(([hex]) => !isNeutral(hex));
  const primary = (buttonStyle && toHex(buttonStyle.backgroundColor) && !isNeutral(toHex(buttonStyle.backgroundColor)!)
    ? toHex(buttonStyle.backgroundColor)
    : chromatic[0]?.[0]) ?? null;
  const total = ranked.reduce((n, [, v]) => n + v, 0) || 1;

  const headings: Omit<Styleguide, "url">["typography"]["headings"] = {};
  for (const tag of ["h1", "h2", "h3", "h4"]) {
    const el = Array.from(document.querySelectorAll(tag)).find(visible);
    if (!el) continue;
    const hs = getComputedStyle(el);
    headings[tag] = { fontFamily: hs.fontFamily, fontSize: hs.fontSize, fontWeight: hs.fontWeight, lineHeight: hs.lineHeight };
  }
  const p = Array.from(document.querySelectorAll("p")).find(visible);
  const ps = p ? getComputedStyle(p) : bodyStyle;

  const cssVariables: Record<string, string> = {};
  const rootStyle = getComputedStyle(document.documentElement);
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    for (const rule of Array.from(rules)) {
      if (!(rule instanceof CSSStyleRule) || !/^(:root|html|body)$/.test(rule.selectorText)) continue;
      for (const name of Array.from(rule.style)) {
        if (name.startsWith("--") && Object.keys(cssVariables).length < 200) {
          cssVariables[name] = rootStyle.getPropertyValue(name).trim() || rule.style.getPropertyValue(name).trim();
        }
      }
    }
  }

  const fontSources = new Map<string, string>();
  for (const face of Array.from(document.fonts)) {
    if (!fontSources.has(face.family)) fontSources.set(face.family.replace(/["']/g, ""), face.status);
  }
  for (const l of Array.from(document.querySelectorAll<HTMLLinkElement>("link[href*='fonts.googleapis.com'], link[href*='use.typekit.net']"))) {
    for (const fam of l.href.matchAll(/family=([^&:]+)/g)) fontSources.set(decodeURIComponent(fam[1]!).replace(/\+/g, " "), l.href);
  }

  const top = <T,>(m: Map<T, number>, n: number) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);

  return {
    colorScheme: luminance(background) < 0.4 ? "dark" : "light",
    colors: {
      background,
      foreground,
      primary,
      accent: chromatic.find(([hex]) => hex !== primary)?.[0] ?? null,
      palette: ranked.slice(0, 12).map(([hex, v]) => ({ hex, usage: Math.round((v / total) * 1000) / 1000 })),
    },
    typography: {
      fonts: [...fonts.entries()]
        .filter(([f]) => f)
        .slice(0, 8)
        .map(([family, usage]) => ({ family, usage: [...usage], source: fontSources.get(family) ?? null })),
      headings,
      body: { fontFamily: ps.fontFamily, fontSize: ps.fontSize, lineHeight: ps.lineHeight },
    },
    components: {
      button: buttonStyle
        ? pick(buttonStyle, ["background-color", "color", "border-radius", "padding", "font-size", "font-weight", "border", "box-shadow", "text-transform"])
        : null,
      link: link ? pick(getComputedStyle(link), ["color", "text-decoration-line", "font-weight"]) : null,
      input: input ? pick(getComputedStyle(input), ["background-color", "color", "border", "border-radius", "padding", "font-size"]) : null,
    },
    radii: top(radii, 6),
    shadows: top(shadows, 4),
    spacing: top(spacing, 8).sort((a, b) => Number.parseFloat(a) - Number.parseFloat(b)),
    cssVariables,
  };
}
