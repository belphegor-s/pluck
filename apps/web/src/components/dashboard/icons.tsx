/**
 * Sidebar icons, drawn for this app on a 24px grid with a 1.75 stroke so they
 * sit at the weight of the body text.
 */
const PATHS = {
  overview: "M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-3H4zM14 7h6V4h-6z",
  keys: "M15 7a4 4 0 1 1-3.87 5H8v3H5v-3H3v-3h8.13A4 4 0 0 1 15 7zm0 3.5h.01",
  model: "M12 3v3M12 18v3M3 12h3M18 12h3M7 7h10v10H7zM10 10h4v4h-4z",
  proxies:
    "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3.5 9h17M3.5 15h17M12 3c2.5 2.6 3.5 5.6 3.5 9s-1 6.4-3.5 9c-2.5-2.6-3.5-5.6-3.5-9s1-6.4 3.5-9z",
  monitors:
    "M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z",
  webhooks: "M9 7.5a3 3 0 1 1 4.5 2.6L16.5 15M6 17a3 3 0 1 0 3-3M9 14h7.5M18 17a3 3 0 1 0-1.5-5.6",
  credits:
    "M12 3.5c4.7 0 8.5 1.6 8.5 3.5s-3.8 3.5-8.5 3.5S3.5 8.9 3.5 7 7.3 3.5 12 3.5zM3.5 7v5c0 1.9 3.8 3.5 8.5 3.5s8.5-1.6 8.5-3.5V7M3.5 12v5c0 1.9 3.8 3.5 8.5 3.5s8.5-1.6 8.5-3.5v-5",
  invoices: "M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h5",
  playground: "M8 6l-5 6 5 6M16 6l5 6-5 6M13.5 4l-3 16",
  docs: "M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5zM20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z",
  collapse: "M9 4v16M15 9l-3 3 3 3M4 4h16v16H4z",
  expand: "M9 4v16M13 9l3 3-3 3M4 4h16v16H4z",
  menu: "M3.5 7h17M3.5 12h17M3.5 17h17",
  close: "M6 6l12 12M18 6L6 18",
  signout: "M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10",
  external: "M14 4h6v6M20 4l-9 9M18 14v6H4V6h6",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className = "size-[18px]" }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
