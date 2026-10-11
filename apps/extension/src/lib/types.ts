export type ToolId =
  | "markdown"
  | "extract"
  | "brand"
  | "styleguide"
  | "map"
  | "screenshot"
  | "search";

/** How the extension reaches an instance. Kept in local storage, never synced. */
export interface Account {
  apiKey: string;
  apiUrl: string;
  /** `connect`: signed in through the site. `key`: a key pasted in settings. */
  via: "connect" | "key";
  workspace?: { id: string; name: string };
  user?: { name: string; email: string };
  connectedAt: number;
}

export type Theme = "auto" | "light" | "dark";

/** Where the markdown tool reads from. */
export type MarkdownSource = "remote" | "live";

export interface Settings {
  theme: Theme;
  markdownSource: MarkdownSource;
  mainContentOnly: boolean;
  /** Needs the optional `tabs` permission; off until the person turns it on. */
  followTabs: boolean;
  keepHistory: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "auto",
  markdownSource: "remote",
  mainContentOnly: true,
  followTabs: false,
  keepHistory: true,
};

/** The tab Pluck is pointed at. `url` is null when the tab cannot be seen. */
export interface Target {
  tabId: number;
  url: string | null;
  title: string;
  favicon: string | null;
}

/** Something the background asks the panel to do: a menu click or a shortcut. */
export interface Intent {
  id: string;
  tool: ToolId;
  /** Start straight away instead of waiting for the button. */
  run?: boolean;
  /** Markdown only: read a link rather than the tab. */
  url?: string;
  /** Markdown only: HTML of the selection, already cleaned. */
  selection?: { html: string; title: string; url: string; truncated: boolean };
}

/** A finished run, kept so its output can be copied again later. */
export interface HistoryEntry {
  id: string;
  tool: ToolId;
  title: string;
  url: string;
  at: number;
  credits: number | null;
  /** The copyable output; dropped when it is too large to keep. */
  text?: string;
  filename: string;
}

/** A run's output in the form every tool can offer: something to copy or save. */
export interface Output {
  text: string;
  filename: string;
  mime: string;
}
