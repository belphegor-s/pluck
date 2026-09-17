import "server-only";
import { createHighlighter, type HighlighterGeneric } from "shiki";

const LANGS = [
  "bash",
  "json",
  "typescript",
  "javascript",
  "python",
  "html",
  "css",
  "yaml",
  "sql",
  "diff",
] as const;

let highlighterPromise: Promise<HighlighterGeneric<never, never>> | null = null;

/**
 * One highlighter per process. Dual themes emit CSS variables for both
 * schemes, so light and dark switch instantly with no second render.
 */
function getHighlighter() {
  highlighterPromise ??= createHighlighter({
    themes: ["github-light", "github-dark-dimmed"],
    langs: [...LANGS],
  }) as unknown as Promise<HighlighterGeneric<never, never>>;
  return highlighterPromise;
}

export const normaliseLang = (lang?: string): string => {
  const key = (lang ?? "").toLowerCase();
  const alias: Record<string, string> = {
    ts: "typescript",
    js: "javascript",
    jsx: "javascript",
    tsx: "typescript",
    sh: "bash",
    shell: "bash",
    curl: "bash",
    py: "python",
    yml: "yaml",
  };
  const resolved = alias[key] ?? key;
  return (LANGS as readonly string[]).includes(resolved) ? resolved : "bash";
};

export async function highlight(code: string, lang?: string): Promise<string> {
  const highlighter = await getHighlighter();
  return highlighter.codeToHtml(code, {
    lang: normaliseLang(lang),
    themes: { light: "github-light", dark: "github-dark-dimmed" },
    defaultColor: false,
    cssVariablePrefix: "--sh-",
  });
}
