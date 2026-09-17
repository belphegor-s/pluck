/**
 * Credit pricing. 1 credit = USD 0.001 on Pluck Cloud.
 * Self-hosted instances run with billing disabled and ignore these numbers.
 */
export const CREDIT_USD = 0.001;

export const credits = {
  scrape: 1,
  browserRender: 2,
  residentialProxy: 5,
  screenshot: 2,
  parse: 2,
  parsePerTenPages: 1,
  map: 1,
  search: 2,
  crawlPage: 1,
  /** Any LLM step on the instance key. */
  llm: 8,
  /** Any LLM step when the caller brings their own provider key. */
  llmByok: 1,
  extractProduct: 3,
  styleguide: 5,
  brand: 10,
  classify: 3,
  transaction: 5,
  monitorCheck: 1,
} as const;

export const creditPacks = [
  { id: "starter", credits: 10_000, priceUsd: 10 },
  { id: "builder", credits: 55_000, priceUsd: 50, bonus: "10% bonus" },
  { id: "scale", credits: 240_000, priceUsd: 200, bonus: "20% bonus" },
  { id: "hyper", credits: 1_300_000, priceUsd: 1_000, bonus: "30% bonus" },
] as const;

export const SIGNUP_GRANT = 1_000;

export interface CostInput {
  browser?: boolean;
  residential?: boolean;
  screenshot?: boolean;
  llm?: "instance" | "byok" | null;
}

export function scrapeCost({ browser, residential, screenshot, llm }: CostInput): number {
  return (
    credits.scrape +
    (browser ? credits.browserRender : 0) +
    (residential ? credits.residentialProxy : 0) +
    (screenshot ? credits.screenshot : 0) +
    llmCost(llm)
  );
}

export const llmCost = (llm: CostInput["llm"]) =>
  llm === "instance" ? credits.llm : llm === "byok" ? credits.llmByok : 0;
