"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DayPoint } from "@/lib/admin/stats";

/**
 * The overview's charts. Colours come from the theme's CSS variables, so they
 * follow light and dark mode without re-rendering.
 */

const INK_FAINT = "var(--ink-faint)";
const LINE = "var(--line)";
const ACCENT = "var(--accent)";
const LEAF = "var(--leaf)";
const INK = "var(--ink-soft)";

const day = (value: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(value));
const short = (value: number) =>
  new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);

const axis = {
  stroke: LINE,
  tick: { fill: INK_FAINT, fontSize: 12 },
  tickLine: false,
  axisLine: false,
} as const;

function Frame({ children, height = 240 }: { children: React.ReactElement; height?: number }) {
  return (
    <div style={{ height }} className="w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

function Tip({
  active,
  payload,
  label,
  format,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
  format?: (name: string, v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="sheet px-3 py-2 text-sm shadow-lg">
      <p className="mono mb-1 text-xs text-[var(--ink-faint)]">{label ? day(label) : ""}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2">
          <span className="inline-block size-2" style={{ background: p.color }} />
          <span className="text-[var(--ink-soft)]">{p.name}</span>
          <span className="ml-auto pl-4 tabular-nums">
            {format ? format(p.name, p.value) : p.value.toLocaleString("en-US")}
          </span>
        </p>
      ))}
    </div>
  );
}

export function RequestsChart({ data }: { data: DayPoint[] }) {
  return (
    <Frame>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <defs>
          <linearGradient id="req" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={LEAF} stopOpacity={0.35} />
            <stop offset="100%" stopColor={LEAF} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="err" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={ACCENT} stopOpacity={0.4} />
            <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={LINE} vertical={false} />
        <XAxis dataKey="day" tickFormatter={day} minTickGap={24} {...axis} />
        <YAxis tickFormatter={short} width={48} {...axis} />
        <Tooltip content={<Tip />} cursor={{ stroke: LINE }} />
        <Area
          type="monotone"
          dataKey="requests"
          name="Requests"
          stroke={LEAF}
          strokeWidth={2}
          fill="url(#req)"
        />
        <Area
          type="monotone"
          dataKey="errors"
          name="Errors"
          stroke={ACCENT}
          strokeWidth={2}
          fill="url(#err)"
        />
      </AreaChart>
    </Frame>
  );
}

export function RevenueChart({ data }: { data: DayPoint[] }) {
  return (
    <Frame>
      <ComposedChart data={data} margin={{ top: 8, right: 0, left: -12, bottom: 0 }}>
        <CartesianGrid stroke={LINE} vertical={false} />
        <XAxis dataKey="day" tickFormatter={day} minTickGap={24} {...axis} />
        <YAxis yAxisId="usd" tickFormatter={(v) => `$${short(v)}`} width={52} {...axis} />
        <YAxis yAxisId="n" orientation="right" allowDecimals={false} width={32} {...axis} />
        <Tooltip
          content={<Tip format={(n, v) => (n === "Revenue" ? `$${v.toFixed(2)}` : String(v))} />}
          cursor={{ fill: "var(--accent-wash)" }}
        />
        <Bar
          yAxisId="usd"
          dataKey="revenue"
          name="Revenue"
          fill={ACCENT}
          radius={[2, 2, 0, 0]}
          maxBarSize={28}
        />
        <Line
          yAxisId="n"
          type="monotone"
          dataKey="signups"
          name="Sign-ups"
          stroke={INK}
          strokeWidth={2}
          dot={false}
        />
      </ComposedChart>
    </Frame>
  );
}

export function LatencyChart({ data }: { data: DayPoint[] }) {
  return (
    <Frame>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid stroke={LINE} vertical={false} />
        <XAxis dataKey="day" tickFormatter={day} minTickGap={24} {...axis} />
        <YAxis
          tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${v}ms`)}
          width={52}
          {...axis}
        />
        <Tooltip
          content={<Tip format={(_, v) => `${v.toLocaleString("en-US")} ms`} />}
          cursor={{ stroke: LINE }}
        />
        <Line type="monotone" dataKey="p50" name="p50" stroke={LEAF} strokeWidth={2} dot={false} />
        <Line
          type="monotone"
          dataKey="p95"
          name="p95"
          stroke={ACCENT}
          strokeWidth={2}
          dot={false}
          strokeDasharray="4 3"
        />
      </LineChart>
    </Frame>
  );
}

export function CreditsChart({ data }: { data: DayPoint[] }) {
  return (
    <Frame>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid stroke={LINE} vertical={false} />
        <XAxis dataKey="day" tickFormatter={day} minTickGap={24} {...axis} />
        <YAxis tickFormatter={short} width={48} {...axis} />
        <Tooltip content={<Tip />} cursor={{ fill: "var(--accent-wash)" }} />
        <Bar
          dataKey="credits"
          name="Credits used"
          fill={LEAF}
          radius={[2, 2, 0, 0]}
          maxBarSize={28}
        />
      </BarChart>
    </Frame>
  );
}

/** Horizontal share bars for the endpoint table: no axes, just proportion. */
export function ShareBar({
  value,
  max,
  tone = "leaf",
}: {
  value: number;
  max: number;
  tone?: "leaf" | "accent";
}) {
  const pct = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div className="h-1.5 w-full bg-[var(--line)]">
      <div
        className="h-full"
        style={{ width: `${pct}%`, background: tone === "leaf" ? LEAF : ACCENT }}
      />
    </div>
  );
}
