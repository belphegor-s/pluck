import type { EndpointOutput } from "@pluck/shared";
import { useEffect, useState } from "react";
import { call } from "../../lib/api";
import { slugify } from "../../lib/format";
import { hostOf } from "../../lib/page";
import { copyText, Field, Out, useCopied } from "../../ui/kit";
import { Meta, ProblemNote, pretty, ResultBar, RunRow, ToolFrame, usePage } from "../parts";
import { usePanel, useRun } from "../state";
import { COST, credits } from "./registry";

type Brand = EndpointOutput<"brand">;

/** One color: click to copy its hex. */
export function Swatch({ hex, caption }: { hex: string; caption?: string }) {
  const [copied, run] = useCopied();
  return (
    <button
      type="button"
      className="swatch"
      title={`Copy ${hex}`}
      onClick={() => run(() => copyText(hex))}
    >
      <span className="swatch-color" style={{ background: hex }} />
      <span className="swatch-hex" aria-live="polite">
        {copied ? "copied" : (caption ?? hex)}
      </span>
    </button>
  );
}

function BrandCard({ brand }: { brand: Brand }) {
  const logos = brand.logos.filter((logo) => logo.type !== "og").slice(0, 8);
  const industry = brand.industries?.naics[0];
  const place = brand.address
    ? [brand.address.city, brand.address.region, brand.address.country].filter(Boolean).join(", ")
    : "";
  return (
    <div className="stack">
      <div>
        <h2>{brand.name ?? brand.domain}</h2>
        {(brand.slogan || brand.description) && (
          <p className="soft">{brand.slogan ?? brand.description}</p>
        )}
      </div>

      {logos.length > 0 && (
        <div>
          <span className="label">Logos</span>
          <div className="logos">
            {logos.map((logo) => (
              <Out key={logo.url} href={logo.url} className="logo-tile">
                <img
                  src={logo.url}
                  alt={`${brand.name ?? brand.domain} ${logo.type}`}
                  loading="lazy"
                />
              </Out>
            ))}
          </div>
        </div>
      )}

      {brand.colors.length > 0 && (
        <div>
          <span className="label">Colors</span>
          <div className="swatches">
            {brand.colors.slice(0, 12).map((color) => (
              <Swatch key={color.hex} hex={color.hex} />
            ))}
          </div>
        </div>
      )}

      {brand.fonts.length > 0 && (
        <div>
          <span className="label">Fonts</span>
          <div className="chips">
            {brand.fonts.map((font) => (
              <span key={font} className="chip">
                {font}
              </span>
            ))}
          </div>
        </div>
      )}

      <dl className="facts">
        <dt>Domain</dt>
        <dd className="mono">{brand.domain}</dd>
        {industry && (
          <>
            <dt>Industry</dt>
            <dd>{industry.title}</dd>
          </>
        )}
        {place && (
          <>
            <dt>Based in</dt>
            <dd>{place}</dd>
          </>
        )}
        {brand.stock && (
          <>
            <dt>Ticker</dt>
            <dd className="mono">{brand.stock.ticker}</dd>
          </>
        )}
        {brand.email && (
          <>
            <dt>Email</dt>
            <dd>{brand.email}</dd>
          </>
        )}
        {brand.phone && (
          <>
            <dt>Phone</dt>
            <dd>{brand.phone}</dd>
          </>
        )}
      </dl>

      {brand.socials.length > 0 && (
        <div className="chips">
          {brand.socials.map((social) => (
            <Out key={social.url} href={social.url} className="chip">
              {social.network}
            </Out>
          ))}
        </div>
      )}
    </div>
  );
}

export function BrandTool() {
  const { account, record, refreshUsage } = usePanel();
  const { host, reach } = usePage();
  const tabDomain = reach === "public" ? host : "";
  const [domain, setDomain] = useState(tabDomain);
  const [edited, setEdited] = useState(false);
  const { run, start, cancel } = useRun<Brand>();

  // Follows the tab until the person types a domain of their own.
  useEffect(() => {
    if (!edited) setDomain(tabDomain);
  }, [tabDomain, edited]);

  const wanted = hostOf(/^https?:\/\//i.test(domain) ? domain : `https://${domain.trim()}`);

  const go = () =>
    start(async (signal) => {
      const { data, meta } = await call(account, "brand", { domain: wanted }, { signal });
      record({
        tool: "brand",
        title: data.name ?? data.domain,
        url: `https://${data.domain}`,
        credits: meta.creditsUsed,
        text: pretty(data),
        filename: `${slugify(data.domain)}-brand.json`,
      });
      refreshUsage();
      return { value: data, meta };
    });

  return (
    <ToolFrame name="Brand" cost={credits(COST.brand)}>
      <section className="section stack">
        <Field label="Company domain" hint="Filled in from the tab; any domain works.">
          <input
            className="input mono"
            value={domain}
            placeholder="stripe.com"
            spellCheck={false}
            autoCapitalize="none"
            onChange={(e) => {
              setEdited(true);
              setDomain(e.target.value);
            }}
            onKeyDown={(e) => e.key === "Enter" && wanted.includes(".") && void go()}
          />
        </Field>
        <RunRow
          label="Look up the brand"
          busyLabel="Looking it up"
          running={run.status === "running"}
          disabled={!wanted.includes(".")}
          onRun={() => void go()}
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
              filename: `${slugify(run.value.domain)}-brand.json`,
              mime: "application/json",
            }}
            copyLabel="Copy JSON"
          />
          <Meta meta={run.meta} />
          <BrandCard brand={run.value} />
        </section>
      )}
    </ToolFrame>
  );
}
