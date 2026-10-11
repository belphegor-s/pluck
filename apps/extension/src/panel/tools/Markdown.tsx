import { useEffect, useState } from "react";
import { call } from "../../lib/api";
import type { Captured } from "../../lib/capture";
import { slugify } from "../../lib/format";
import { CaptureError, captureTab, hostOf } from "../../lib/page";
import { textToBase64 } from "../../lib/pkce";
import type { MarkdownSource } from "../../lib/types";
import { Check, Note, Segmented } from "../../ui/kit";
import {
  CodeView,
  Meta,
  PageGate,
  ProblemNote,
  ResultBar,
  RunRow,
  TargetCard,
  ToolFrame,
  usePage,
} from "../parts";
import { usePanel, useRun } from "../state";
import { COST, credits } from "./registry";

interface Page {
  markdown: string;
  title: string;
  url: string;
  warnings: string[];
}

const SOURCES = [
  { value: "remote", label: "Fetch the page" },
  { value: "live", label: "This tab as I see it" },
] as const;

export function MarkdownTool() {
  const { account, settings, intent, consumeIntent, record, refreshUsage } = usePanel();
  const { target, url, reach } = usePage();
  const [chosen, setChosen] = useState<MarkdownSource>(settings.markdownSource);
  const [mainOnly, setMainOnly] = useState(settings.mainContentOnly);
  const { run, start, cancel } = useRun<Page>();

  // A page only this browser can reach leaves one way to read it.
  const source: MarkdownSource = reach === "public" ? chosen : "live";

  const keep = (page: Page, creditsUsed: number) => {
    const name = page.title || hostOf(page.url) || "page";
    record({
      tool: "markdown",
      title: name,
      url: page.url,
      credits: creditsUsed,
      text: page.markdown,
      filename: `${slugify(name)}.md`,
    });
    refreshUsage();
  };

  /** The API fetches the address itself: cleanest result, public pages only. */
  const fetchUrl = (address: string, fallbackTitle: string) =>
    start(async (signal) => {
      const { data, meta } = await call(
        account,
        "scrape",
        { url: address, formats: ["markdown"], onlyMainContent: mainOnly },
        { signal },
      );
      const value: Page = {
        markdown: data.markdown ?? "",
        title: data.metadata.title ?? fallbackTitle,
        url: data.metadata.finalUrl || address,
        warnings: data.warnings,
      };
      keep(value, meta.creditsUsed);
      return { value, meta };
    });

  /** HTML read from the tab, converted by the API. */
  const convert = (captured: Captured | Promise<Captured>) =>
    start(async (signal) => {
      const page = await captured;
      const { data, meta } = await call(
        account,
        "parse",
        {
          base64: textToBase64(page.html),
          filename: "page.html",
          contentType: "text/html; charset=utf-8",
        },
        { signal },
      );
      const value: Page = {
        markdown: data.markdown,
        title: page.title || data.title || "",
        url: page.url,
        warnings: page.truncated
          ? ["The page was very large, so only the first part of it was read."]
          : [],
      };
      keep(value, meta.creditsUsed);
      return { value, meta };
    });

  const readTab = () =>
    convert(
      target
        ? captureTab(target.tabId, mainOnly ? "main" : "page")
        : Promise.reject(new CaptureError("access")),
    );

  const go = () => {
    if (source === "live") void readTab();
    else if (url) void fetchUrl(url, target?.title ?? "");
  };

  // A right-click or shortcut asked for this: start without waiting for the button.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once per request, when the page it needs is known
  useEffect(() => {
    if (intent?.tool !== "markdown") return;
    const needsPage = !intent.selection && !intent.url;
    if (needsPage && !url) return;
    consumeIntent();
    if (!intent.run) return;
    if (intent.selection) void convert(intent.selection);
    else if (intent.url) void fetchUrl(intent.url, "");
    else go();
  }, [intent, url]);

  const running = run.status === "running";
  const done = run.status === "done" ? run : null;

  return (
    <ToolFrame name="Markdown" cost={credits(source === "live" ? COST.live : COST.fetch)}>
      <section className="section stack">
        <TargetCard target={target} />
        <Segmented
          name="source"
          label="Where to read the page from"
          value={source}
          onChange={setChosen}
          options={SOURCES.map((option) => ({
            ...option,
            disabled: option.value === "remote" && reach !== "public",
          }))}
        />
        <p className="field-hint">
          {source === "remote"
            ? "The API fetches the address itself and renders JavaScript when the page needs it. Cleanest result; public pages only."
            : "Reads what is on your screen, pages behind a sign-in included. The visible text is sent to the API; anything typed into a form never is."}
        </p>
        <Check checked={mainOnly} onChange={setMainOnly}>
          Main content only: leave out menus, sidebars and footers
        </Check>
        {source === "remote" && <PageGate reach={reach} liveHint />}
        <RunRow
          label="Pluck as markdown"
          busyLabel="Plucking"
          running={running}
          disabled={!url || reach === "none"}
          onRun={go}
          onCancel={cancel}
        />
      </section>

      {run.status === "error" && (
        <section className="section">
          <ProblemNote
            problem={run.problem}
            onLive={
              source === "remote" && target
                ? () => {
                    setChosen("live");
                    void readTab();
                  }
                : undefined
            }
          />
        </section>
      )}

      {done && (
        <section className="section stack">
          {done.value.markdown.trim() ? (
            <>
              <ResultBar
                output={{
                  text: done.value.markdown,
                  filename: `${slugify(done.value.title || hostOf(done.value.url))}.md`,
                  mime: "text/markdown",
                }}
                copyLabel="Copy markdown"
              />
              <Meta meta={done.meta} text={done.value.markdown} />
              {done.value.warnings.map((warning) => (
                <Note key={warning} tone="warn">
                  {warning}
                </Note>
              ))}
              <CodeView>{done.value.markdown}</CodeView>
            </>
          ) : (
            <Note tone="warn" title="Nothing came back">
              The page had no readable content this way. Try the other source above.
            </Note>
          )}
        </section>
      )}
    </ToolFrame>
  );
}
