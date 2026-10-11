import type { ResponseMeta } from "@pluck/shared";
import { Fragment, type ReactNode } from "react";
import type { Problem } from "../lib/api";
import { site } from "../lib/config";
import { downloadText, estimateTokens, formatDuration, formatNumber, plural } from "../lib/format";
import { displayUrl, hostOf, type Reach, reachOf } from "../lib/page";
import type { Output, Target } from "../lib/types";
import { Button, CopyButton, Icon, IconButton, Note, Out } from "../ui/kit";
import { usePanel } from "./state";

/** The tab Pluck is pointed at, or how to point it at one. */
export function TargetCard({ target }: { target: Target | null }) {
  if (!target?.url)
    return (
      <div className="sheet target">
        <span className="target-icon" aria-hidden="true">
          ?
        </span>
        <div className="grow">
          <p className="target-title">Pluck is not open on this tab</p>
          <p className="soft">
            Click the Pluck button in the toolbar, or press <kbd>Alt</kbd> <kbd>Shift</kbd>{" "}
            <kbd>P</kbd>, to point it here.
          </p>
        </div>
      </div>
    );
  const host = hostOf(target.url);
  return (
    <div className="sheet target">
      <span className="target-icon" aria-hidden="true">
        {target.favicon ? <img src={target.favicon} alt="" /> : (host[0] ?? "·")}
      </span>
      <div className="grow">
        <p className="target-title truncate">{target.title || host || "Untitled page"}</p>
        <p className="target-url truncate">{displayUrl(target.url)}</p>
      </div>
    </div>
  );
}

/** A tool's own header: back to the list, its name, and what a run costs. */
export function ToolFrame({
  name,
  cost,
  children,
}: {
  name: string;
  cost?: string;
  children: ReactNode;
}) {
  const { back, billing } = usePanel();
  return (
    <>
      <header className="bar">
        <IconButton label="Back to all tools" icon="back" onClick={back} />
        <h1 className="bar-title">{name}</h1>
        <span className="bar-spacer" />
        {billing && cost && <span className="pill">{cost}</span>}
      </header>
      {children}
    </>
  );
}

/** Why a tool that needs the API to fetch the page cannot run on this tab, if it cannot. */
export function PageGate({ reach, liveHint }: { reach: Reach; liveHint?: boolean }) {
  if (reach === "public") return null;
  if (reach === "local")
    return (
      <Note tone="warn" title="Only your browser can reach this address">
        The API fetches pages from the internet, and this one is on your machine or network.
        {liveHint && " Reading the tab as you see it still works."}
      </Note>
    );
  return (
    <Note title="Open a web page">
      Pluck works on pages with an http or https address. Browser pages and files are out of reach.
    </Note>
  );
}

export const usePage = () => {
  const { target } = usePanel();
  const url = target?.url ?? null;
  return { target, url, reach: reachOf(url), host: hostOf(url) };
};

export function RunRow({
  label,
  busyLabel,
  running,
  disabled,
  onRun,
  onCancel,
}: {
  label: string;
  busyLabel: string;
  running: boolean;
  disabled?: boolean;
  onRun: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="row">
      <Button variant="accent" className="grow" busy={running} disabled={disabled} onClick={onRun}>
        {running ? busyLabel : label}
      </Button>
      {running && (
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      )}
    </div>
  );
}

/** A failed run, with the one action that would fix it where there is one. */
export function ProblemNote({ problem, onLive }: { problem: Problem; onLive?: () => void }) {
  const { reconnect, account } = usePanel();
  return (
    <Note tone="error" title={problem.title}>
      {problem.detail}
      {problem.action === "reconnect" && (
        <div className="row">
          <Button variant="solid" small onClick={reconnect}>
            {account.via === "connect" ? "Connect again" : "Open settings"}
          </Button>
        </div>
      )}
      {problem.action === "credits" && (
        <div className="row">
          <Out href={site("/dashboard/billing")} className="btn btn--solid btn--small">
            Buy credits
          </Out>
        </div>
      )}
      {problem.action === "model" && (
        <div className="row">
          <Out href={site("/dashboard/ai")} className="btn btn--solid btn--small">
            Add a model key
          </Out>
        </div>
      )}
      {problem.action === "live" && onLive && (
        <div className="row">
          <Button variant="solid" small onClick={onLive}>
            Read the tab as I see it instead
          </Button>
        </div>
      )}
      {problem.requestId && <p className="mono faint">Request {problem.requestId}</p>}
    </Note>
  );
}

export function Meta({
  meta,
  text,
  extra,
}: {
  meta: ResponseMeta | null;
  /** When given, an approximate token count is shown: what a model will see. */
  text?: string;
  extra?: ReactNode;
}) {
  const { billing } = usePanel();
  return (
    <p className="meta">
      {text !== undefined && <span>about {plural(estimateTokens(text), "token")}</span>}
      {extra}
      {meta && billing && <span>{plural(meta.creditsUsed, "credit")}</span>}
      {meta?.cached && <span>cached</span>}
      {meta && <span>{formatDuration(meta.durationMs)}</span>}
    </p>
  );
}

/** Copy and save, the two things anyone does with a result. */
export function ResultBar({
  output,
  copyLabel = "Copy",
  children,
}: {
  output: Output;
  copyLabel?: string;
  children?: ReactNode;
}) {
  return (
    <div className="result-bar">
      <CopyButton text={output.text} label={copyLabel} variant="solid" />
      <Button small onClick={() => downloadText(output.text, output.filename, output.mime)}>
        <Icon name="download" size={14} />
        Save
      </Button>
      {children}
    </div>
  );
}

export function CodeView({ children }: { children: ReactNode }) {
  return (
    // Focusable so a long result can be scrolled and selected from the keyboard.
    // biome-ignore lint/a11y/noNoninteractiveTabindex: a scroll container needs focus to be scrolled by keyboard
    <pre className="sheet code" tabIndex={0}>
      {children}
    </pre>
  );
}

const JSON_TOKEN =
  /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
/** Past this size the colouring costs more than it helps. */
const HIGHLIGHT_LIMIT = 120_000;

/** Pretty JSON with keys, strings and literals tinted. */
export function JsonView({ text }: { text: string }) {
  if (text.length > HIGHLIGHT_LIMIT) return <CodeView>{text}</CodeView>;
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(JSON_TOKEN)) {
    const [token, string, colon, literal] = match;
    const at = match.index;
    if (at > last) parts.push(text.slice(last, at));
    if (string && colon) {
      parts.push(
        <Fragment key={at}>
          <span className="k">{string}</span>
          {colon}
        </Fragment>,
      );
    } else {
      parts.push(
        <span key={at} className={string ? "s" : literal ? "k" : "n"}>
          {token}
        </span>,
      );
    }
    last = at + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <CodeView>{parts}</CodeView>;
}

export const pretty = (value: unknown): string => JSON.stringify(value, null, 2) ?? "null";

export const count = formatNumber;
