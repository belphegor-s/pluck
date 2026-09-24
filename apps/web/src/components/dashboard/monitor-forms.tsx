"use client";

import { useActionState, useState } from "react";
import { SelectMenu } from "@/components/select-menu";
import { type ActionState, createMonitor, deleteMonitor, updateMonitor } from "@/lib/actions";

const empty: ActionState = {};

export const INTERVALS = [
  { minutes: 15, label: "Every 15 minutes" },
  { minutes: 60, label: "Hourly" },
  { minutes: 360, label: "Every 6 hours" },
  { minutes: 720, label: "Twice a day" },
  { minutes: 1440, label: "Daily" },
  { minutes: 10_080, label: "Weekly" },
] as const;

const intervalOptions = INTERVALS.map((i) => ({ value: i.minutes as number, label: i.label }));

export const intervalLabel = (minutes: number) =>
  INTERVALS.find((i) => i.minutes === minutes)?.label ??
  (minutes < 60 ? `Every ${minutes} min` : `Every ${Math.round(minutes / 60)} h`);

const TYPES = [
  { id: "page", label: "Page", note: "The page's text. Optionally one CSS selector." },
  { id: "sitemap", label: "Sitemap", note: "URLs added to or removed from the site." },
  { id: "extract", label: "Extraction", note: "Fields you describe, pulled from the page." },
] as const;

const input =
  "mt-1 w-full border border-[var(--line)] bg-[var(--sheet)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]";

function Notice({ state }: { state: ActionState }) {
  if (!state.ok && !state.error) return null;
  return (
    <p
      className={`text-sm ${state.error ? "text-[var(--accent)]" : "text-[var(--leaf)]"}`}
      role="status"
    >
      {state.error ?? state.ok}
    </p>
  );
}

export function CreateMonitorForm() {
  const [state, action, pending] = useActionState(createMonitor, empty);
  const [type, setType] = useState<(typeof TYPES)[number]["id"]>("page");

  return (
    <form action={action} className="space-y-4">
      <fieldset>
        <legend className="text-sm text-[var(--ink-soft)]">What to watch</legend>
        <div className="mt-1 grid gap-2 sm:grid-cols-3">
          {TYPES.map((option) => (
            <label
              key={option.id}
              className={`sheet cursor-pointer p-3 text-sm transition-colors ${
                type === option.id ? "border-[var(--accent)]" : "hover:border-[var(--ink-faint)]"
              }`}
            >
              <span className="flex items-center gap-2">
                <input
                  type="radio"
                  name="type"
                  value={option.id}
                  checked={type === option.id}
                  onChange={() => setType(option.id)}
                  className="accent-[var(--accent)]"
                />
                <span className="font-medium">{option.label}</span>
              </span>
              <span className="mt-1 block text-xs text-[var(--ink-faint)]">{option.note}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm sm:col-span-2">
          <span className="block text-[var(--ink-soft)]">
            {type === "sitemap" ? "Site" : "Page"} URL
          </span>
          <input
            name="url"
            type="url"
            required
            inputMode="url"
            placeholder={type === "sitemap" ? "https://example.com" : "https://example.com/pricing"}
            className={`mono ${input}`}
          />
        </label>
        <label className="block text-sm">
          <span className="block text-[var(--ink-soft)]">Name</span>
          <input name="name" maxLength={120} placeholder="Competitor pricing" className={input} />
        </label>
        <div className="text-sm">
          <span className="block text-[var(--ink-soft)]">Check</span>
          <SelectMenu
            name="intervalMinutes"
            label="Check interval"
            defaultValue={1440}
            options={intervalOptions}
          />
        </div>
      </div>

      {type === "page" && (
        <label className="block text-sm">
          <span className="block text-[var(--ink-soft)]">CSS selector (optional)</span>
          <input
            name="selector"
            maxLength={500}
            placeholder="#pricing, .plans"
            className={`mono ${input}`}
          />
          <span className="mt-1 block text-xs text-[var(--ink-faint)]">
            Watch one part of the page, so a changing footer or timestamp does not count as a
            change.
          </span>
        </label>
      )}

      {type === "extract" && (
        <label className="block text-sm">
          <span className="block text-[var(--ink-soft)]">What to extract</span>
          <textarea
            name="prompt"
            required
            rows={3}
            maxLength={4000}
            placeholder="Each plan's name, monthly price and included seats."
            className={input}
          />
          <span className="mt-1 block text-xs text-[var(--ink-faint)]">
            Compared field by field, so rewording on the page does not trigger a change.
          </span>
        </label>
      )}

      <label className="block text-sm">
        <span className="block text-[var(--ink-soft)]">Webhook URL (optional)</span>
        <input
          name="webhook"
          type="url"
          inputMode="url"
          placeholder="https://you.example.com/hooks/pluck"
          className={`mono ${input}`}
        />
        <span className="mt-1 block text-xs text-[var(--ink-faint)]">
          Receives a signed <code className="mono">monitor.changed</code> event. Changes are also
          listed here either way.
        </span>
      </label>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          type="submit"
          disabled={pending}
          className="bg-[var(--ink)] px-4 py-2.5 text-sm text-[var(--paper)] disabled:opacity-60 sm:py-2"
        >
          {pending ? "Creating…" : "Start watching"}
        </button>
        <Notice state={state} />
      </div>
    </form>
  );
}

export function MonitorRowActions({ id, active }: { id: string; active: boolean }) {
  const [toggleState, toggle, toggling] = useActionState(updateMonitor, empty);
  const [removeState, remove, removing] = useActionState(deleteMonitor, empty);
  const error = toggleState.error ?? removeState.error;

  return (
    <div className="flex items-center justify-end gap-3">
      {error && <span className="text-xs text-[var(--accent)]">{error}</span>}
      <form action={toggle}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="active" value={String(!active)} />
        <button
          type="submit"
          disabled={toggling}
          className="text-xs text-[var(--ink-soft)] underline underline-offset-4 hover:text-[var(--ink)] disabled:opacity-60"
        >
          {active ? "Pause" : "Resume"}
        </button>
      </form>
      <form
        action={remove}
        onSubmit={(event) => {
          // Deleting also deletes the change history, so it asks first.
          if (!confirm("Delete this monitor and its change history?")) event.preventDefault();
        }}
      >
        <input type="hidden" name="id" value={id} />
        <button
          type="submit"
          disabled={removing}
          className="text-xs text-[var(--ink-faint)] underline underline-offset-4 hover:text-[var(--accent)] disabled:opacity-60"
        >
          Delete
        </button>
      </form>
    </div>
  );
}

export function EditMonitorForm({
  monitor,
}: {
  monitor: {
    id: string;
    name: string | null;
    type: string;
    intervalMinutes: number;
    webhook: string | null;
    selector: string | null;
  };
}) {
  const [state, action, pending] = useActionState(updateMonitor, empty);
  const known = INTERVALS.some((i) => i.minutes === monitor.intervalMinutes);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={monitor.id} />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="block text-[var(--ink-soft)]">Name</span>
          <input name="name" maxLength={120} defaultValue={monitor.name ?? ""} className={input} />
        </label>
        <div className="text-sm">
          <span className="block text-[var(--ink-soft)]">Check</span>
          <SelectMenu
            name="intervalMinutes"
            label="Check interval"
            defaultValue={monitor.intervalMinutes}
            // An interval set through the API may not be one of the presets;
            // it stays selectable rather than silently changing on save.
            options={
              known
                ? intervalOptions
                : [
                    {
                      value: monitor.intervalMinutes,
                      label: intervalLabel(monitor.intervalMinutes),
                    },
                    ...intervalOptions,
                  ]
            }
          />
        </div>
      </div>
      {monitor.type === "page" && (
        <label className="block text-sm">
          <span className="block text-[var(--ink-soft)]">CSS selector</span>
          <input
            name="selector"
            maxLength={500}
            defaultValue={monitor.selector ?? ""}
            placeholder="Whole page"
            className={`mono ${input}`}
          />
        </label>
      )}
      <label className="block text-sm">
        <span className="block text-[var(--ink-soft)]">Webhook URL</span>
        <input
          name="webhook"
          type="url"
          inputMode="url"
          defaultValue={monitor.webhook ?? ""}
          placeholder="None (leave empty to stop sending)"
          className={`mono ${input}`}
        />
      </label>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          type="submit"
          disabled={pending}
          className="bg-[var(--ink)] px-4 py-2.5 text-sm text-[var(--paper)] disabled:opacity-60 sm:py-2"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
        <Notice state={state} />
      </div>
    </form>
  );
}
