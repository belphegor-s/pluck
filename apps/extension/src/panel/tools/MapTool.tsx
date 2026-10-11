import { useMemo, useState } from "react";
import { call } from "../../lib/api";
import { plural, slugify } from "../../lib/format";
import { Check, Field, Out } from "../../ui/kit";
import {
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

const LIMIT = 2000;
/** More rows than this and the panel gets slow; the copy still has them all. */
const SHOWN = 300;

export function MapTool() {
  const { account, record, refreshUsage } = usePanel();
  const { target, url, reach, host } = usePage();
  const [subdomains, setSubdomains] = useState(false);
  const [filter, setFilter] = useState("");
  const { run, start, cancel } = useRun<string[]>();

  const go = () => {
    if (!url) return;
    const origin = new URL(url).origin;
    void start(async (signal) => {
      const { data, meta } = await call(
        account,
        "map",
        { url: origin, limit: LIMIT, includeSubdomains: subdomains },
        { signal },
      );
      const value = data.links.map((link) => link.url);
      record({
        tool: "map",
        title: `${host}: ${plural(value.length, "URL")}`,
        url: origin,
        credits: meta.creditsUsed,
        text: value.join("\n"),
        filename: `${slugify(host)}-urls.txt`,
      });
      refreshUsage();
      return { value, meta };
    });
  };

  const all = run.status === "done" ? run.value : null;
  const matches = useMemo(() => {
    if (!all) return [];
    const needle = filter.trim().toLowerCase();
    return needle ? all.filter((link) => link.toLowerCase().includes(needle)) : all;
  }, [all, filter]);

  return (
    <ToolFrame name="Map" cost={credits(COST.map)}>
      <section className="section stack">
        <TargetCard target={target} />
        <Check checked={subdomains} onChange={setSubdomains}>
          Include subdomains, such as docs.{host || "example.com"}
        </Check>
        <PageGate reach={reach} />
        <RunRow
          label={`Map ${host || "this site"}`}
          busyLabel="Mapping"
          running={run.status === "running"}
          disabled={reach !== "public"}
          onRun={go}
          onCancel={cancel}
        />
      </section>

      {run.status === "error" && (
        <section className="section">
          <ProblemNote problem={run.problem} />
        </section>
      )}

      {run.status === "done" && all && (
        <section className="section stack">
          <ResultBar
            output={{
              text: matches.join("\n"),
              filename: `${slugify(host)}-urls.txt`,
              mime: "text/plain",
            }}
            copyLabel={filter.trim() ? "Copy matches" : "Copy all"}
          />
          <Meta
            meta={run.meta}
            extra={
              <span>
                {plural(all.length, "URL")}
                {all.length >= LIMIT ? " (the first found)" : ""}
              </span>
            }
          />
          {all.length > 8 && (
            <Field label="Filter">
              <input
                className="input mono"
                value={filter}
                placeholder="/blog/"
                spellCheck={false}
                onChange={(e) => setFilter(e.target.value)}
              />
            </Field>
          )}
          {matches.length === 0 ? (
            <p className="soft">
              {all.length ? "No URL matches the filter." : "No URLs were found."}
            </p>
          ) : (
            <div className="sheet list list--scroll">
              {matches.slice(0, SHOWN).map((link) => (
                <Out key={link} href={link} className="list-url truncate">
                  {link.replace(/^https?:\/\//, "")}
                </Out>
              ))}
              {matches.length > SHOWN && (
                <p className="faint">
                  and {plural(matches.length - SHOWN, "more")}, all included when you copy or save
                </p>
              )}
            </div>
          )}
        </section>
      )}
    </ToolFrame>
  );
}
