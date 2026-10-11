import type { EndpointOutput } from "@pluck/shared";
import { useState } from "react";
import { call } from "../../lib/api";
import { slugify } from "../../lib/format";
import { displayUrl } from "../../lib/page";
import { Field, Out, Segmented } from "../../ui/kit";
import { Meta, ProblemNote, ResultBar, RunRow, ToolFrame } from "../parts";
import { usePanel, useRun } from "../state";
import { COST, credits } from "./registry";

type Hit = EndpointOutput<"search">["results"][number];

const KINDS = [
  { value: "web", label: "Web" },
  { value: "news", label: "News" },
] as const;

/** Results as a markdown list: what gets pasted into a prompt. */
export const toMarkdown = (query: string, hits: Pick<Hit, "title" | "url" | "snippet">[]): string =>
  `# ${query}\n\n${hits
    .map((hit) => `- [${hit.title}](${hit.url})${hit.snippet ? `\n  ${hit.snippet}` : ""}`)
    .join("\n")}\n`;

export function SearchTool() {
  const { account, record, refreshUsage } = usePanel();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<(typeof KINDS)[number]["value"]>("web");
  const { run, start, cancel } = useRun<{ query: string; hits: Hit[] }>();

  const go = () => {
    const text = query.trim();
    if (!text) return;
    void start(async (signal) => {
      const { data, meta } = await call(
        account,
        "search",
        { query: text, category: kind, limit: 10 },
        { signal },
      );
      record({
        tool: "search",
        title: text,
        url: "",
        credits: meta.creditsUsed,
        text: toMarkdown(text, data.results),
        filename: `${slugify(text, "search")}.md`,
      });
      refreshUsage();
      return { value: { query: text, hits: data.results }, meta };
    });
  };

  return (
    <ToolFrame name="Search" cost={credits(COST.search)}>
      <section className="section stack">
        <Field label="Search the web">
          <input
            className="input"
            type="search"
            value={query}
            maxLength={500}
            placeholder="open source vector databases compared"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && go()}
          />
        </Field>
        <Segmented
          name="kind"
          label="Kind of results"
          value={kind}
          onChange={setKind}
          options={KINDS}
        />
        <RunRow
          label="Search"
          busyLabel="Searching"
          running={run.status === "running"}
          disabled={!query.trim()}
          onRun={go}
          onCancel={cancel}
        />
      </section>

      {run.status === "error" && (
        <section className="section">
          <ProblemNote problem={run.problem} />
        </section>
      )}

      {run.status === "done" && (
        <section className="section stack">
          {run.value.hits.length === 0 ? (
            <p className="soft">Nothing found for that. Try fewer or different words.</p>
          ) : (
            <>
              <ResultBar
                output={{
                  text: toMarkdown(run.value.query, run.value.hits),
                  filename: `${slugify(run.value.query, "search")}.md`,
                  mime: "text/markdown",
                }}
                copyLabel="Copy as markdown"
              />
              <Meta meta={run.meta} />
              <div className="sheet list">
                {run.value.hits.map((hit) => (
                  <div key={hit.url}>
                    <Out href={hit.url} className="hit-title">
                      {hit.title || displayUrl(hit.url)}
                    </Out>
                    <p className="list-url truncate">{displayUrl(hit.url)}</p>
                    {hit.snippet && <p className="hit-snippet">{hit.snippet}</p>}
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      )}
    </ToolFrame>
  );
}
