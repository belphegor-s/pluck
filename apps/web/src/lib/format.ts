/**
 * Numbers are pinned to en-US grouping. `toLocaleString()` with no locale
 * follows whatever the server or browser is set to, so the same page rendered
 * 1,300,000 in one place and 13,00,000 in another.
 */
const numbers = new Intl.NumberFormat("en-US");

export const formatNumber = (value: number): string => numbers.format(value);

export const formatUsd = (value: number): string =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
