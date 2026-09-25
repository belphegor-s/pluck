import Link from "next/link";
import { formatNumber } from "@/lib/format";

/** Presentational pieces shared by the admin pages. Server-safe, no state. */

export const usd = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  }).format(value);

export const compact = (value: number) =>
  new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);

export const bytes = (value: number) => {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = value;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
};

export const ms = (value: number) =>
  value >= 1000 ? `${(value / 1000).toFixed(1)} s` : `${value} ms`;

export const dateTime = (value: Date | string | null) =>
  value
    ? new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(value))
    : "Never";

export function PageTitle({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl">{title}</h1>
        {description && <p className="mt-1.5 text-[var(--ink-soft)]">{description}</p>}
      </div>
      {children}
    </div>
  );
}

export function Kpi({
  label,
  value,
  hint,
  tone = "plain",
}: {
  label: string;
  value: string;
  hint?: React.ReactNode;
  tone?: "plain" | "good" | "bad";
}) {
  return (
    <div className="sheet p-4 sm:p-5">
      <p className="mono text-xs uppercase tracking-wider text-[var(--ink-faint)]">{label}</p>
      <p
        className={`mt-2 text-3xl tabular-nums ${
          tone === "bad" ? "text-[var(--accent)]" : tone === "good" ? "text-[var(--leaf)]" : ""
        }`}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-sm text-[var(--ink-soft)]">{hint}</p>}
    </div>
  );
}

export function Card({
  title,
  action,
  children,
  flush = false,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  flush?: boolean;
}) {
  return (
    <section className="sheet min-w-0">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3 sm:px-5">
        <h2 className="text-lg">{title}</h2>
        {action}
      </div>
      <div className={flush ? "" : "p-4 sm:p-5"}>{children}</div>
    </section>
  );
}

export function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--line)] text-left">
            {head.map((h) => (
              <th
                key={h}
                className="mono whitespace-nowrap px-4 py-2.5 text-xs font-normal uppercase tracking-wider text-[var(--ink-faint)] sm:px-5"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&_td]:px-4 [&_td]:py-2.5 sm:[&_td]:px-5 [&_tr]:border-b [&_tr]:border-[var(--line)] [&_tr:last-child]:border-0">
          {children}
        </tbody>
      </table>
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-6 text-center text-[var(--ink-faint)] sm:px-5">{children}</p>;
}

export function Badge({
  tone = "plain",
  children,
}: {
  tone?: "plain" | "good" | "bad";
  children: React.ReactNode;
}) {
  const colors =
    tone === "good"
      ? "border-[var(--leaf)] text-[var(--leaf)]"
      : tone === "bad"
        ? "border-[var(--accent)] text-[var(--accent)]"
        : "border-[var(--line)] text-[var(--ink-soft)]";
  return (
    <span className={`mono inline-block border px-1.5 py-0.5 text-xs ${colors}`}>{children}</span>
  );
}

export function RangeTabs({ days, base }: { days: number; base: string }) {
  return (
    <div className="flex border border-[var(--line)] bg-[var(--sheet)] p-0.5 text-sm">
      {[7, 30, 90].map((d) => (
        <Link
          key={d}
          href={`${base}?days=${d}`}
          aria-current={d === days ? "page" : undefined}
          className={`px-3 py-1.5 transition-colors ${
            d === days
              ? "bg-[var(--ink)] text-[var(--paper)]"
              : "text-[var(--ink-soft)] hover:text-[var(--ink)]"
          }`}
        >
          {d} days
        </Link>
      ))}
    </div>
  );
}

export { formatNumber };
