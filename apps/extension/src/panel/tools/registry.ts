import { CONFIG } from "../../lib/config";
import { plural } from "../../lib/format";
import type { ToolId } from "../../lib/types";

export interface ToolInfo {
  id: ToolId;
  name: string;
  blurb: string;
  /** What one run costs on the hosted service, as the menu shows it. */
  cost: string;
  /** Works without a page in front of it. */
  standalone?: boolean;
}

const c = CONFIG.credits;
export const credits = (count: number) => plural(count, "credit");

export const COST = {
  fetch: c.scrape,
  live: c.parse,
  extract: c.scrape + c.llm,
  extractOwnModel: c.scrape + c.llmByok,
  brand: c.brand,
  styleguide: c.styleguide,
  map: c.map,
  screenshot: c.scrape + c.browserRender + c.screenshot,
  search: c.search,
} as const;

export const TOOLS: readonly ToolInfo[] = [
  {
    id: "markdown",
    name: "Markdown",
    blurb: "This page as clean markdown, ready for a prompt.",
    cost: `from ${credits(COST.fetch)}`,
  },
  {
    id: "extract",
    name: "Extract",
    blurb: "Say what you want from the page and get it back as JSON.",
    cost: credits(COST.extract),
  },
  {
    id: "brand",
    name: "Brand",
    blurb: "Logos, colors, fonts and company facts for this site.",
    cost: credits(COST.brand),
    standalone: true,
  },
  {
    id: "styleguide",
    name: "Styleguide",
    blurb: "The design tokens this page is really built from.",
    cost: credits(COST.styleguide),
  },
  {
    id: "map",
    name: "Map",
    blurb: "Every URL on this site, from its sitemaps and links.",
    cost: credits(COST.map),
  },
  {
    id: "screenshot",
    name: "Screenshot",
    blurb: "A clean capture of the page, full length if you like.",
    cost: credits(COST.screenshot),
  },
  {
    id: "search",
    name: "Search",
    blurb: "Web results in a form you can hand to a model.",
    cost: credits(COST.search),
    standalone: true,
  },
];

export const toolName = (id: ToolId): string => TOOLS.find((tool) => tool.id === id)?.name ?? id;
