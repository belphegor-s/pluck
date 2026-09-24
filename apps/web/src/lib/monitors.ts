/**
 * Monitor check intervals. Kept out of the monitor form's client module so
 * server pages can call `intervalLabel` too: a function exported from a
 * "use client" file is only a reference on the server, never callable.
 */
export const INTERVALS = [
  { minutes: 15, label: "Every 15 minutes" },
  { minutes: 60, label: "Hourly" },
  { minutes: 360, label: "Every 6 hours" },
  { minutes: 720, label: "Twice a day" },
  { minutes: 1440, label: "Daily" },
  { minutes: 10_080, label: "Weekly" },
] as const;

export const intervalLabel = (minutes: number) =>
  INTERVALS.find((i) => i.minutes === minutes)?.label ??
  (minutes < 60 ? `Every ${minutes} min` : `Every ${Math.round(minutes / 60)} h`);
