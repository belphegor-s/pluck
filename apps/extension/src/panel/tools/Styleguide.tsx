import type { EndpointOutput } from "@pluck/shared";
import { call } from "../../lib/api";
import { slugify } from "../../lib/format";
import { CopyButton } from "../../ui/kit";
import {
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
import { Swatch } from "./Brand";
import { COST, credits } from "./registry";

type Styleguide = EndpointOutput<"styleguide">;

/** The tokens as a `:root` block someone can paste into a stylesheet. */
export function toCss(guide: Styleguide): string {
  const lines: string[] = [];
  const add = (name: string, value: string | null | undefined) => {
    if (value) lines.push(`  --${name}: ${value};`);
  };
  add("color-background", guide.colors.background);
  add("color-foreground", guide.colors.foreground);
  add("color-primary", guide.colors.primary);
  add("color-accent", guide.colors.accent);
  for (const [i, color] of guide.colors.palette.entries()) add(`palette-${i + 1}`, color.hex);
  for (const [i, font] of guide.typography.fonts.entries())
    add(`font-${i + 1}`, `"${font.family}"`);
  add("font-size-body", guide.typography.body?.fontSize);
  for (const [tag, style] of Object.entries(guide.typography.headings))
    add(`font-size-${tag}`, style.fontSize);
  for (const [i, radius] of guide.radii.entries()) add(`radius-${i + 1}`, radius);
  for (const [i, space] of guide.spacing.entries()) add(`space-${i + 1}`, space);
  for (const [i, shadow] of guide.shadows.entries()) add(`shadow-${i + 1}`, shadow);
  return `:root {\n${lines.join("\n")}\n}\n`;
}

function Tokens({ guide }: { guide: Styleguide }) {
  const roles = [
    { name: "background", hex: guide.colors.background },
    { name: "text", hex: guide.colors.foreground },
    { name: "primary", hex: guide.colors.primary },
    { name: "accent", hex: guide.colors.accent },
  ].flatMap((role) => (role.hex ? [{ name: role.name, hex: role.hex }] : []));
  const headings = Object.entries(guide.typography.headings);

  return (
    <div className="stack">
      {roles.length > 0 && (
        <div>
          <span className="label">Roles</span>
          <div className="swatches">
            {roles.map((role) => (
              <Swatch key={role.name} hex={role.hex} caption={role.name} />
            ))}
          </div>
        </div>
      )}

      {guide.colors.palette.length > 0 && (
        <div>
          <span className="label">Palette, most used first</span>
          <div className="swatches">
            {guide.colors.palette.slice(0, 16).map((color) => (
              <Swatch key={color.hex} hex={color.hex} />
            ))}
          </div>
        </div>
      )}

      {guide.typography.fonts.length > 0 && (
        <div>
          <span className="label">Typefaces</span>
          <dl className="facts">
            {guide.typography.fonts.map((font) => (
              <div key={font.family} className="contents">
                <dt>{font.usage.join(", ") || "used"}</dt>
                <dd>{font.family}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {(headings.length > 0 || guide.typography.body) && (
        <div>
          <span className="label">Type scale</span>
          <dl className="facts mono">
            {headings.map(([tag, style]) => (
              <div key={tag} className="contents">
                <dt>{tag}</dt>
                <dd>
                  {style.fontSize} / {style.lineHeight}, {style.fontWeight}
                </dd>
              </div>
            ))}
            {guide.typography.body && (
              <>
                <dt>body</dt>
                <dd>
                  {guide.typography.body.fontSize} / {guide.typography.body.lineHeight}
                </dd>
              </>
            )}
          </dl>
        </div>
      )}

      {guide.radii.length > 0 && (
        <div>
          <span className="label">Corner radii</span>
          <div className="chips">
            {guide.radii.map((radius) => (
              <span key={radius} className="chip mono">
                {radius}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function StyleguideTool() {
  const { account, record, refreshUsage } = usePanel();
  const { target, url, reach, host } = usePage();
  const { run, start, cancel } = useRun<Styleguide>();

  const go = () => {
    if (!url) return;
    void start(async (signal) => {
      const { data, meta } = await call(account, "styleguide", { url }, { signal });
      record({
        tool: "styleguide",
        title: target?.title || host,
        url: data.url,
        credits: meta.creditsUsed,
        text: pretty(data),
        filename: `${slugify(host)}-styleguide.json`,
      });
      refreshUsage();
      return { value: data, meta };
    });
  };

  return (
    <ToolFrame name="Styleguide" cost={credits(COST.styleguide)}>
      <section className="section stack">
        <TargetCard target={target} />
        <p className="field-hint">
          The page is rendered in a real browser and its computed styles are measured, so these are
          the values in use, not the ones a stylesheet merely declares.
        </p>
        <PageGate reach={reach} />
        <RunRow
          label="Read the design tokens"
          busyLabel="Measuring the page"
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

      {run.status === "done" && (
        <section className="section stack">
          <ResultBar
            output={{
              text: pretty(run.value),
              filename: `${slugify(host)}-styleguide.json`,
              mime: "application/json",
            }}
            copyLabel="Copy JSON"
          >
            <CopyButton text={() => toCss(run.value)} label="Copy as CSS" />
          </ResultBar>
          <Meta meta={run.meta} extra={<span>{run.value.colorScheme} scheme</span>} />
          <Tokens guide={run.value} />
        </section>
      )}
    </ToolFrame>
  );
}
