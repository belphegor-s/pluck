"use client";

import { PostgreSQL, sql as sqlLanguage } from "@codemirror/lang-sql";
import { EditorView, keymap } from "@codemirror/view";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import {
  Check,
  ChevronRight,
  Clipboard,
  Download,
  History,
  Loader2,
  Lock,
  PanelLeft,
  Play,
  Search,
  ShieldAlert,
  Sparkles,
  Table2,
  Unlock,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { runSqlAction } from "@/lib/admin/actions";
import type { SqlError, SqlMode, SqlResult } from "@/lib/admin/sql";

interface TableInfo {
  name: string;
  rows: number;
  columns: { name: string; type: string }[];
}

const STARTERS: { label: string; query: string }[] = [
  {
    label: "Newest users",
    query: `select id, name, email, created_at\nfrom "user"\norder by created_at desc\nlimit 50`,
  },
  {
    label: "Workspaces by balance",
    query: `select id, name, credits, created_at\nfrom organization\norder by credits desc\nlimit 50`,
  },
  {
    label: "Usage by endpoint, 24 hours",
    query: `select endpoint, count(*) as requests, sum(credits) as credits,\n       round(avg(duration_ms)) as avg_ms,\n       count(*) filter (where status >= 500) as errors\nfrom usage_event\nwhere created_at > now() - interval '24 hours'\ngroup by endpoint\norder by requests desc`,
  },
  {
    label: "Failed requests, 24 hours",
    query: `select created_at, endpoint, status, target, duration_ms\nfrom usage_event\nwhere status >= 500 and created_at > now() - interval '24 hours'\norder by created_at desc\nlimit 100`,
  },
  {
    label: "Revenue by day",
    query: `select date_trunc('day', created_at)::date as day,\n       sum(amount_usd_cents) / 100.0 as usd, count(*) as purchases\nfrom credit_ledger\nwhere reason = 'purchase'\ngroup by 1\norder by 1 desc`,
  },
  {
    label: "Table sizes",
    query: `select relname as table, n_live_tup as rows,\n       pg_size_pretty(pg_total_relation_size(relid)) as size\nfrom pg_stat_user_tables\norder by pg_total_relation_size(relid) desc`,
  },
];

const HISTORY_KEY = "pluck-admin-sql-history";
const DRAFT_KEY = "pluck-admin-sql-draft";

const readJson = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};
const writeJson = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
};

/** The editor follows the site's theme through CSS variables. */
const theme = EditorView.theme({
  "&": { backgroundColor: "var(--paper)", color: "var(--ink)", fontSize: "14px", height: "100%" },
  ".cm-content": { fontFamily: "var(--font-mono)", caretColor: "var(--accent)", padding: "12px 0" },
  ".cm-gutters": { backgroundColor: "var(--paper)", color: "var(--ink-faint)", border: "none" },
  ".cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--accent-wash) 45%, transparent)" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--ink)" },
  "&.cm-focused": { outline: "none" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": {
    backgroundColor: "color-mix(in srgb, var(--accent) 25%, transparent) !important",
  },
  ".cm-cursor": { borderLeftColor: "var(--accent)" },
  ".cm-tooltip": {
    backgroundColor: "var(--sheet)",
    border: "1px solid var(--line)",
    color: "var(--ink)",
  },
  ".cm-tooltip-autocomplete ul li[aria-selected]": {
    backgroundColor: "var(--accent-wash)",
    color: "var(--ink)",
  },
  ".cm-scroller": { overflow: "auto" },
});

const highlight = EditorView.theme({
  ".tok-keyword": { color: "var(--accent)" },
  ".tok-string": { color: "var(--leaf)" },
  ".tok-number": { color: "var(--leaf)" },
  ".tok-comment": { color: "var(--ink-faint)", fontStyle: "italic" },
  ".tok-typeName": { color: "var(--ink-soft)" },
  ".tok-operator": { color: "var(--ink-soft)" },
});

type Outcome = (SqlResult | SqlError) & { query: string };

const csvCell = (v: unknown) => {
  if (v === null || v === undefined) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function SqlConsole({ tables, problem }: { tables: TableInfo[]; problem: string | null }) {
  const [query, setQuery] = useState(STARTERS[0]?.query ?? "");
  const [writes, setWrites] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [panel, setPanel] = useState<"schema" | "history">("schema");
  const [panelOpen, setPanelOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [openTable, setOpenTable] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const editor = useRef<ReactCodeMirrorRef>(null);

  useEffect(() => {
    setHistory(readJson<string[]>(HISTORY_KEY, []));
    const draft = readJson<string | null>(DRAFT_KEY, null);
    if (draft) setQuery(draft);
  }, []);
  useEffect(() => {
    const t = setTimeout(() => writeJson(DRAFT_KEY, query), 400);
    return () => clearTimeout(t);
  }, [query]);

  /** The selected text if there is any, otherwise the whole editor. */
  const statement = useCallback(() => {
    const view = editor.current?.view;
    if (!view) return query;
    const { from, to } = view.state.selection.main;
    return from !== to ? view.state.sliceDoc(from, to) : query;
  }, [query]);

  const execute = useCallback(
    (mode: SqlMode, confirm?: string) => {
      const text = statement().trim();
      if (!text) return;
      start(async () => {
        const result = await runSqlAction({ query: text, mode, confirm });
        setOutcome({ ...result, query: text });
        if (result.ok) {
          const next = [text, ...history.filter((h) => h !== text)].slice(0, 30);
          setHistory(next);
          writeJson(HISTORY_KEY, next);
        }
        if (mode === "commit" && result.ok) {
          setConfirming(false);
          setConfirmText("");
        }
      });
    },
    [statement, history],
  );

  const extensions = useMemo(
    () => [
      sqlLanguage({
        dialect: PostgreSQL,
        upperCaseKeywords: false,
        schema: Object.fromEntries(tables.map((t) => [t.name, t.columns.map((c) => c.name)])),
      }),
      theme,
      highlight,
      EditorView.lineWrapping,
      keymap.of([
        {
          key: "Mod-Enter",
          preventDefault: true,
          run: () => {
            execute(writes ? "preview" : "read");
            return true;
          },
        },
      ]),
    ],
    [tables, execute, writes],
  );

  const insert = (text: string) => {
    const view = editor.current?.view;
    if (!view) return setQuery(text);
    view.dispatch(view.state.replaceSelection(text));
    view.focus();
  };

  const copy = async (kind: "csv" | "json") => {
    if (!outcome?.ok) return;
    const text =
      kind === "csv"
        ? [
            outcome.columns.map(csvCell).join(","),
            ...outcome.rows.map((r) => r.map(csvCell).join(",")),
          ].join("\n")
        : JSON.stringify(
            outcome.rows.map((r) => Object.fromEntries(outcome.columns.map((c, i) => [c, r[i]]))),
            null,
            2,
          );
    await navigator.clipboard.writeText(text);
    setCopied(kind);
    setTimeout(() => setCopied(null), 1500);
  };

  const download = () => {
    if (!outcome?.ok) return;
    const text = [
      outcome.columns.map(csvCell).join(","),
      ...outcome.rows.map((r) => r.map(csvCell).join(",")),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `pluck-query-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const shown = tables.filter((t) => t.name.includes(filter.toLowerCase()));
  const isWrite = outcome?.ok && outcome.mode === "preview";

  const sidePanel = (
    <div className="flex h-full flex-col">
      <div className="flex border-b border-[var(--line)] text-sm">
        {(["schema", "history"] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPanel(p)}
            className={`flex flex-1 cursor-pointer items-center justify-center gap-1.5 py-2.5 ${
              panel === p
                ? "border-b-2 border-[var(--accent)] text-[var(--ink)]"
                : "text-[var(--ink-soft)]"
            }`}
          >
            {p === "schema" ? <Table2 className="size-4" /> : <History className="size-4" />}
            {p === "schema" ? "Tables" : "History"}
          </button>
        ))}
      </div>
      {panel === "schema" ? (
        <>
          <div className="relative border-b border-[var(--line)]">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--ink-faint)]" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter tables"
              className="w-full bg-transparent py-2.5 pl-9 pr-3 text-sm outline-none"
            />
          </div>
          <ul className="flex-1 overflow-y-auto py-1 text-sm">
            {shown.map((t) => (
              <li key={t.name}>
                <div className="group flex items-center">
                  <button
                    type="button"
                    onClick={() => setOpenTable(openTable === t.name ? null : t.name)}
                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 px-3 py-1.5 text-left hover:bg-[var(--paper)]"
                  >
                    <ChevronRight
                      className={`size-3.5 shrink-0 text-[var(--ink-faint)] transition-transform ${openTable === t.name ? "rotate-90" : ""}`}
                    />
                    <span className="mono truncate">{t.name}</span>
                    <span className="ml-auto pl-2 text-xs tabular-nums text-[var(--ink-faint)]">
                      {t.rows >= 1000 ? `${Math.round(t.rows / 100) / 10}k` : t.rows}
                    </span>
                  </button>
                  <button
                    type="button"
                    title={`Query ${t.name}`}
                    onClick={() => {
                      setQuery(`select *\nfrom "${t.name}"\nlimit 100`);
                      setPanelOpen(false);
                    }}
                    className="mr-1 cursor-pointer p-1 text-[var(--ink-faint)] opacity-60 hover:text-[var(--accent)] group-hover:opacity-100"
                  >
                    <Play className="size-3.5" />
                  </button>
                </div>
                {openTable === t.name && (
                  <ul className="mb-1 ml-8 border-l border-[var(--line)]">
                    {t.columns.map((c) => (
                      <li key={c.name}>
                        <button
                          type="button"
                          onClick={() => insert(c.name)}
                          className="flex w-full cursor-pointer items-baseline gap-2 px-3 py-1 text-left hover:bg-[var(--paper)]"
                          title="Insert column name"
                        >
                          <span className="mono truncate text-xs">{c.name}</span>
                          <span className="ml-auto shrink-0 text-[11px] text-[var(--ink-faint)]">
                            {c.type}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
            {shown.length === 0 && (
              <li className="px-3 py-4 text-[var(--ink-faint)]">No tables match.</li>
            )}
          </ul>
        </>
      ) : (
        <ul className="flex-1 overflow-y-auto text-sm">
          {history.length === 0 && (
            <li className="px-3 py-4 text-[var(--ink-faint)]">
              Queries you run appear here, on this device only.
            </li>
          )}
          {history.map((h) => (
            <li key={h} className="border-b border-[var(--line)]">
              <button
                type="button"
                onClick={() => {
                  setQuery(h);
                  setPanelOpen(false);
                }}
                className="mono block w-full cursor-pointer whitespace-pre-wrap px-3 py-2 text-left text-xs hover:bg-[var(--paper)]"
              >
                {h.length > 220 ? `${h.slice(0, 220)}…` : h}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">SQL</h1>
          <p className="mt-1.5 text-[var(--ink-soft)]">
            Runs as a restricted database role. Read-only unless you switch writes on, and every run
            is audited.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={writes}
          onClick={() => {
            setWrites((w) => !w);
            setConfirming(false);
          }}
          className={`flex cursor-pointer items-center gap-3 border px-3 py-2 text-sm transition-colors ${
            writes
              ? "border-[var(--accent)] bg-[var(--accent-wash)]"
              : "border-[var(--line)] bg-[var(--sheet)]"
          }`}
        >
          {writes ? (
            <Unlock className="size-4 text-[var(--accent)]" />
          ) : (
            <Lock className="size-4 text-[var(--leaf)]" />
          )}
          <span>{writes ? "Writes on" : "Read-only"}</span>
          <span
            className={`relative h-5 w-9 rounded-full transition-colors ${writes ? "bg-[var(--accent)]" : "bg-[var(--line)]"}`}
          >
            <span
              className={`absolute left-0.5 top-0.5 size-4 rounded-full bg-white shadow transition-transform ${writes ? "translate-x-4" : "translate-x-0"}`}
            />
          </span>
        </button>
      </div>

      {problem && (
        <p className="border-l-2 border-[var(--accent)] bg-[var(--accent-wash)] px-4 py-3 text-sm">
          The editor cannot connect: {problem}
        </p>
      )}

      <div className="grid min-h-0 gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="sheet hidden h-[calc(100dvh-13rem)] min-h-[28rem] overflow-hidden lg:block">
          {sidePanel}
        </aside>

        <div className="min-w-0 space-y-4">
          <div className={`sheet overflow-hidden ${writes ? "border-[var(--accent)]" : ""}`}>
            <div className="flex items-center gap-2 border-b border-[var(--line)] px-3 py-2">
              <button
                type="button"
                onClick={() => setPanelOpen(true)}
                className="flex shrink-0 cursor-pointer items-center gap-1.5 border border-[var(--line)] px-2.5 py-1.5 text-sm lg:hidden"
              >
                <PanelLeft className="size-4" /> Tables
              </button>
              <div className="relative min-w-0 flex-1 sm:flex-none">
                <select
                  aria-label="Start from a useful query"
                  value=""
                  onChange={(e) => {
                    const s = STARTERS.find((x) => x.label === e.target.value);
                    if (s) setQuery(s.query);
                  }}
                  className="w-full cursor-pointer appearance-none truncate border border-[var(--line)] bg-[var(--sheet)] py-1.5 pl-8 pr-3 text-sm outline-none"
                >
                  <option value="">Useful queries</option>
                  {STARTERS.map((s) => (
                    <option key={s.label}>{s.label}</option>
                  ))}
                </select>
                <Sparkles className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-[var(--ink-faint)]" />
              </div>
              <span className="ml-auto hidden text-xs text-[var(--ink-faint)] sm:inline">
                Ctrl+Enter runs · select text to run just that
              </span>
              {writes ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => execute("preview")}
                  className="flex shrink-0 cursor-pointer whitespace-nowrap items-center gap-2 bg-[var(--accent)] px-4 py-1.5 text-sm font-medium text-white disabled:opacity-60"
                >
                  {pending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Play className="size-4" />
                  )}
                  Preview change
                </button>
              ) : (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => execute("read")}
                  className="flex shrink-0 cursor-pointer whitespace-nowrap items-center gap-2 bg-[var(--ink)] px-4 py-1.5 text-sm font-medium text-[var(--paper)] disabled:opacity-60"
                >
                  {pending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Play className="size-4" />
                  )}
                  Run
                </button>
              )}
            </div>
            <div className="h-64 sm:h-72">
              <CodeMirror
                ref={editor}
                value={query}
                onChange={setQuery}
                extensions={extensions}
                basicSetup={{
                  foldGutter: false,
                  highlightActiveLineGutter: true,
                  autocompletion: true,
                }}
                height="100%"
                theme="none"
                aria-label="SQL editor"
              />
            </div>
          </div>

          {isWrite && outcome.ok && (
            <div className="sheet border-[var(--accent)] p-4">
              <div className="flex flex-wrap items-start gap-3">
                <ShieldAlert className="mt-0.5 size-5 shrink-0 text-[var(--accent)]" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    Preview only: this {outcome.command} would affect{" "}
                    {outcome.rowCount.toLocaleString("en-US")}{" "}
                    {outcome.rowCount === 1 ? "row" : "rows"}. Nothing was saved.
                  </p>
                  <p className="mt-1 text-sm text-[var(--ink-soft)]">
                    Committing runs the statement again for real, in a transaction of its own.
                  </p>
                  {confirming ? (
                    <form
                      className="mt-3 flex flex-wrap items-center gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        execute("commit", confirmText);
                      }}
                    >
                      <input
                        ref={(el) => el?.focus()}
                        value={confirmText}
                        onChange={(e) => setConfirmText(e.target.value)}
                        placeholder="Type COMMIT"
                        className="mono w-40 border border-[var(--accent)] bg-[var(--paper)] px-3 py-1.5 outline-none"
                      />
                      <button
                        type="submit"
                        disabled={confirmText !== "COMMIT" || pending}
                        className="cursor-pointer bg-[var(--accent)] px-4 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Commit for real
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirming(false)}
                        className="cursor-pointer px-2 py-1.5 text-sm text-[var(--ink-soft)]"
                      >
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirming(true)}
                      className="mt-3 cursor-pointer border border-[var(--accent)] px-4 py-1.5 text-sm text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white"
                    >
                      Commit this change…
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          <Results
            outcome={outcome}
            pending={pending}
            copied={copied}
            onCopy={copy}
            onDownload={download}
          />
        </div>
      </div>

      {/* Phones and tablets: tables and history in a drawer. */}
      {panelOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close"
            onClick={() => setPanelOpen(false)}
            className="absolute inset-0 bg-[color-mix(in_srgb,var(--ink)_35%,transparent)] backdrop-blur-[2px]"
          />
          <div className="absolute inset-y-0 left-0 flex w-[min(20rem,88vw)] flex-col border-r border-[var(--line)] bg-[var(--sheet)] shadow-xl">
            <div className="flex items-center justify-between border-b border-[var(--line)] px-3 py-2">
              <span className="text-sm font-medium">Database</span>
              <button
                type="button"
                onClick={() => setPanelOpen(false)}
                aria-label="Close"
                className="p-1.5"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1">{sidePanel}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function Results({
  outcome,
  pending,
  copied,
  onCopy,
  onDownload,
}: {
  outcome: Outcome | null;
  pending: boolean;
  copied: string | null;
  onCopy: (kind: "csv" | "json") => void;
  onDownload: () => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (pending && !outcome)
    return (
      <div className="sheet flex items-center gap-2 p-6 text-[var(--ink-soft)]">
        <Loader2 className="size-4 animate-spin" /> Running…
      </div>
    );
  if (!outcome)
    return (
      <div className="sheet p-8 text-center text-[var(--ink-faint)]">
        Results appear here. Pick a table, or start from a useful query.
      </div>
    );

  if (!outcome.ok)
    return (
      <div className="sheet border-[var(--accent)] p-4">
        <p className="mono text-xs uppercase tracking-wider text-[var(--accent)]">Error</p>
        <p className="mono mt-2 whitespace-pre-wrap text-sm">{outcome.error}</p>
        {outcome.position !== undefined && (
          <p className="mono mt-2 text-xs text-[var(--ink-soft)]">
            Near:{" "}
            <span className="bg-[var(--accent-wash)] px-1">
              {outcome.query.slice(Math.max(0, outcome.position - 1), outcome.position + 24)}
            </span>
          </p>
        )}
      </div>
    );

  const noRows = outcome.columns.length === 0;
  return (
    <div className={`sheet min-w-0 overflow-hidden ${pending ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--line)] px-4 py-2.5 text-sm">
        <span className="flex items-center gap-1.5">
          <span
            className={`size-2 rounded-full ${outcome.committed ? "bg-[var(--accent)]" : "bg-[var(--leaf)]"}`}
          />
          {outcome.committed
            ? "Committed"
            : outcome.mode === "preview"
              ? "Preview, rolled back"
              : "Read-only"}
        </span>
        <span className="mono text-[var(--ink-soft)]">{outcome.command}</span>
        <span className="tabular-nums text-[var(--ink-soft)]">
          {outcome.rowCount.toLocaleString("en-US")} {outcome.rowCount === 1 ? "row" : "rows"}
          {outcome.truncated && " (first 1,000 shown)"}
        </span>
        <span className="tabular-nums text-[var(--ink-soft)]">{outcome.durationMs} ms</span>
        {!noRows && (
          <span className="ml-auto flex gap-1.5">
            {(["csv", "json"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => onCopy(k)}
                className="flex cursor-pointer items-center gap-1 border border-[var(--line)] px-2 py-1 text-xs hover:border-[var(--ink-faint)]"
              >
                {copied === k ? (
                  <Check className="size-3.5 text-[var(--leaf)]" />
                ) : (
                  <Clipboard className="size-3.5" />
                )}
                {k.toUpperCase()}
              </button>
            ))}
            <button
              type="button"
              onClick={onDownload}
              title="Download CSV"
              className="flex cursor-pointer items-center border border-[var(--line)] px-2 py-1 hover:border-[var(--ink-faint)]"
            >
              <Download className="size-3.5" />
            </button>
          </span>
        )}
      </div>
      {noRows ? (
        <p className="p-6 text-center text-[var(--ink-soft)]">
          {outcome.command} finished. {outcome.rowCount.toLocaleString("en-US")}{" "}
          {outcome.rowCount === 1 ? "row" : "rows"} affected.
        </p>
      ) : (
        <div className="max-h-[32rem] overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-[var(--sheet)]">
              <tr>
                <th className="mono w-10 border-b border-[var(--line)] px-3 py-2 text-right text-xs font-normal text-[var(--ink-faint)]">
                  #
                </th>
                {outcome.columns.map((c) => (
                  <th
                    key={c}
                    className="mono whitespace-nowrap border-b border-l border-[var(--line)] px-3 py-2 text-left text-xs font-medium"
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {outcome.rows.map((row, r) => (
                <tr key={r} className="hover:bg-[var(--paper)]">
                  <td className="mono border-b border-[var(--line)] px-3 py-1.5 text-right text-xs text-[var(--ink-faint)]">
                    {r + 1}
                  </td>
                  {row.map((v, c) => {
                    const id = `${r}:${c}`;
                    const text =
                      v === null ? null : typeof v === "object" ? JSON.stringify(v) : String(v);
                    const open = expanded === id;
                    return (
                      <td
                        key={c}
                        className={`mono border-b border-l border-[var(--line)] p-0 text-xs ${typeof v === "number" ? "text-right tabular-nums" : ""}`}
                      >
                        <button
                          type="button"
                          onClick={() => setExpanded(open ? null : id)}
                          title={text && text.length > 60 && !open ? "Click to expand" : undefined}
                          className={`block w-full cursor-default px-3 py-1.5 ${typeof v === "number" ? "text-right" : "text-left"} ${
                            open
                              ? "whitespace-pre-wrap break-all"
                              : "max-w-[24rem] truncate whitespace-nowrap"
                          }`}
                        >
                          {text === null ? (
                            <span className="italic text-[var(--ink-faint)]">null</span>
                          ) : (
                            text
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
