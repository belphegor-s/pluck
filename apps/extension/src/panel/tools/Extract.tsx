import { useState } from "react";
import { call } from "../../lib/api";
import { slugify } from "../../lib/format";
import { Field, Note } from "../../ui/kit";
import {
  JsonView,
  Meta,
  PageGate,
  ProblemNote,
  pretty,
  ResultBar,
  RunRow,
  TargetCard,
  ToolFrame,
  usePage,
} from "../parts";
import { usePanel, useRun } from "../state";
import { COST, credits } from "./registry";

/** Starting points; each fills the prompt, which stays editable. */
const PRESETS = [
  {
    label: "Article",
    prompt: "The title, author, publication date and a three sentence summary of this article.",
  },
  {
    label: "Product",
    prompt:
      "The product name, price, currency, availability, rating, review count and key specifications.",
  },
  {
    label: "Contacts",
    prompt:
      "Every email address, phone number and social profile on this page, with the person or team each one belongs to.",
  },
  {
    label: "Table",
    prompt:
      "The main table on this page as an array of objects, one per row, keyed by column header.",
  },
  {
    label: "Key facts",
    prompt: "The ten most important facts on this page, each as one short standalone sentence.",
  },
] as const;

export function ExtractTool() {
  const { account, record, refreshUsage } = usePanel();
  const { target, url, reach, host } = usePage();
  const [prompt, setPrompt] = useState("");
  const [schema, setSchema] = useState("");
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const { run, start, cancel } = useRun<string>();

  const go = () => {
    if (!url) return;
    let parsed: Record<string, unknown> | undefined;
    if (schema.trim()) {
      try {
        const value: unknown = JSON.parse(schema);
        if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("shape");
        parsed = value as Record<string, unknown>;
      } catch {
        setSchemaError("The schema is not a valid JSON object.");
        return;
      }
    }
    setSchemaError(null);
    void start(async (signal) => {
      const { data, meta } = await call(
        account,
        "extract",
        { url, prompt: prompt.trim() || undefined, schema: parsed },
        { signal },
      );
      const value = pretty(data.data);
      record({
        tool: "extract",
        title: target?.title || host,
        url: data.url,
        credits: meta.creditsUsed,
        text: value,
        filename: `${slugify(host)}-extract.json`,
      });
      refreshUsage();
      return { value, meta };
    });
  };

  const ready = Boolean(prompt.trim() || schema.trim());

  return (
    <ToolFrame name="Extract" cost={credits(COST.extract)}>
      <section className="section stack">
        <TargetCard target={target} />
        <Field label="What do you want from this page?">
          <textarea
            className="textarea"
            value={prompt}
            maxLength={8000}
            placeholder="The plan names and monthly prices, as a list"
            onChange={(e) => setPrompt(e.target.value)}
          />
        </Field>
        <div className="chips">
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              className="chip"
              onClick={() => setPrompt(preset.prompt)}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <details>
          <summary className="field-name">Require an exact shape with a JSON Schema</summary>
          <div className="stack stack--tight">
            <textarea
              className="textarea textarea--code"
              value={schema}
              spellCheck={false}
              aria-label="JSON Schema"
              placeholder={
                '{\n  "type": "object",\n  "properties": { "price": { "type": "number" } }\n}'
              }
              onChange={(e) => setSchema(e.target.value)}
            />
            <p className="field-hint">
              The answer is checked against the schema before it is returned.
            </p>
          </div>
        </details>
        {schemaError && <Note tone="error">{schemaError}</Note>}
        <PageGate reach={reach} />
        <p className="field-hint">
          Uses a language model: {credits(COST.extractOwnModel)} instead of {credits(COST.extract)}{" "}
          when the workspace has its own model key.
        </p>
        <RunRow
          label="Extract as JSON"
          busyLabel="Extracting"
          running={run.status === "running"}
          disabled={reach !== "public" || !ready}
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
          <ResultBar
            output={{
              text: run.value,
              filename: `${slugify(host)}-extract.json`,
              mime: "application/json",
            }}
            copyLabel="Copy JSON"
          />
          <Meta meta={run.meta} text={run.value} />
          <JsonView text={run.value} />
        </section>
      )}
    </ToolFrame>
  );
}
