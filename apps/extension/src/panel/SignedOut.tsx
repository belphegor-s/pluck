import { useState } from "react";
import { type DemoResult, demo } from "../lib/api";
import { CONFIG, site } from "../lib/config";
import { beginConnect } from "../lib/connect";
import { formatNumber, slugify } from "../lib/format";
import { hostOf, reachOf } from "../lib/page";
import type { Target } from "../lib/types";
import { Button, CopyButton, IconButton, Logo, Note, Out } from "../ui/kit";
import { CodeView, TargetCard } from "./parts";
import { useRun } from "./state";
import { TOOLS } from "./tools/registry";

/**
 * Before an account is connected. It has two jobs: get the person signed in
 * (on the site, where accounts live), and let them see the thing work on the
 * page in front of them before they decide to.
 */
export function SignedOut({ target }: { target: Target | null }) {
  const [waiting, setWaiting] = useState(false);
  const [failed, setFailed] = useState(false);
  const preview = useRun<DemoResult>();
  const url = target?.url ?? null;
  const previewable = reachOf(url) === "public";

  const connect = () => {
    setFailed(false);
    setWaiting(true);
    beginConnect().catch(() => {
      setWaiting(false);
      setFailed(true);
    });
  };

  const tryIt = () => {
    if (!url) return;
    void preview.start(async (signal) => ({ value: await demo(url, signal), meta: null }));
  };

  return (
    <>
      <header className="bar">
        <Out href={site("/")} className="wordmark">
          <Logo />
          {CONFIG.name}
        </Out>
        <span className="bar-spacer" />
        <IconButton
          label="Settings"
          icon="gear"
          onClick={() => void chrome.runtime.openOptionsPage()}
        />
      </header>

      <section className="hero stack">
        <div>
          <h1>The web, ready for your model.</h1>
          <p>
            {CONFIG.name} turns the page in front of you into clean markdown, structured JSON, brand
            data or a screenshot: what a prompt needs, instead of raw HTML.
          </p>
        </div>
        <Button variant="accent" block onClick={connect}>
          Connect your account
        </Button>
        {waiting ? (
          <Note tone="good" title="Finish in the tab that just opened">
            Sign in there and approve. This panel updates by itself the moment you do.
          </Note>
        ) : (
          <p className="field-hint">
            No account yet? The same button makes one
            {CONFIG.signupGrant > 0 &&
              `, with ${formatNumber(CONFIG.signupGrant)} free credits and no card`}
            .
          </p>
        )}
        {failed && <Note tone="error">The sign-in page could not be opened. Try again.</Note>}
      </section>

      <section className="section stack">
        <span className="label">Try it on this tab</span>
        <TargetCard target={target} />
        <Button
          block
          busy={preview.run.status === "running"}
          disabled={!previewable}
          onClick={tryIt}
        >
          {preview.run.status === "running" ? "Plucking" : "Preview this page as markdown"}
        </Button>
        {preview.run.status === "error" && (
          <Note tone="error" title={preview.run.problem.title}>
            {preview.run.problem.detail}
          </Note>
        )}
        {preview.run.status === "done" && (
          <>
            <div className="result-bar">
              <CopyButton text={preview.run.value.markdown} label="Copy markdown" variant="solid" />
              <span className="meta">
                <span>preview of {hostOf(url) || slugify(url ?? "")}</span>
              </span>
            </div>
            <CodeView>{preview.run.value.markdown}</CodeView>
            <Note title="This is a preview">
              It stops at the first 8,000 characters. Connect an account for whole pages, pages
              behind a sign-in, and every tool below.
            </Note>
          </>
        )}
      </section>

      <section>
        <div className="section">
          <span className="label">What you get</span>
        </div>
        <div className="menu menu--static">
          {TOOLS.map((tool) => (
            <div key={tool.id} className="menu-item">
              <span className="leaders">
                <span className="menu-name">{tool.name}</span>
                <span className="menu-cost">{tool.cost}</span>
              </span>
              <span className="menu-blurb">{tool.blurb}</span>
            </div>
          ))}
        </div>
      </section>

      <footer className="foot">
        <button type="button" onClick={() => void chrome.runtime.openOptionsPage()}>
          Self-hosting? Use your own instance
        </button>
        <Out href={site("/legal/privacy")}>Privacy</Out>
        <Out href={CONFIG.repoUrl}>Source</Out>
      </footer>
    </>
  );
}
