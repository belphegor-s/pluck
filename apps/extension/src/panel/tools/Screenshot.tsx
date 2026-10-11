import { useState } from "react";
import { call } from "../../lib/api";
import { downloadBlob, slugify } from "../../lib/format";
import { Button, Check, Icon, Note, Out, useCopied } from "../../ui/kit";
import { Meta, PageGate, ProblemNote, RunRow, TargetCard, ToolFrame, usePage } from "../parts";
import { usePanel, useRun } from "../state";
import { COST, credits } from "./registry";

interface Shot {
  src: string;
  width: number;
  height: number;
}

/**
 * The image bytes. A data URI is decoded here; a stored image is fetched,
 * which only works when the storage host allows it, hence the null.
 */
async function toBlob(src: string): Promise<Blob | null> {
  try {
    const data = /^data:([^;,]+)[^,]*;base64,(.*)$/s.exec(src);
    if (data) {
      const bytes = Uint8Array.from(atob(data[2] ?? ""), (ch) => ch.charCodeAt(0));
      return new Blob([bytes], { type: data[1] });
    }
    const res = await fetch(src, { credentials: "omit" });
    return res.ok ? await res.blob() : null;
  } catch {
    return null;
  }
}

export function ScreenshotTool() {
  const { account, record, refreshUsage } = usePanel();
  const { target, url, reach, host } = usePage();
  const [fullPage, setFullPage] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const [copied, copy] = useCopied();
  const { run, start, cancel } = useRun<Shot>();

  const go = () => {
    if (!url) return;
    setBlocked(false);
    void start(async (signal) => {
      // PNG, because that is the one image type the clipboard accepts.
      const { data, meta } = await call(
        account,
        "screenshot",
        { url, fullPage, format: "png" },
        { signal },
      );
      const stored = /^https?:/.test(data.screenshot);
      record({
        tool: "screenshot",
        title: target?.title || host,
        url: data.url,
        credits: meta.creditsUsed,
        // A link is worth keeping; megabytes of inline image are not.
        text: stored ? data.screenshot : undefined,
        filename: `${slugify(host)}.png`,
      });
      refreshUsage();
      return { value: { src: data.screenshot, width: data.width, height: data.height }, meta };
    });
  };

  const shot = run.status === "done" ? run.value : null;
  const filename = `${slugify(host)}.png`;

  const save = async () => {
    if (!shot) return;
    const blob = await toBlob(shot.src);
    if (blob) downloadBlob(blob, filename);
    else setBlocked(true);
  };

  const copyImage = async (): Promise<boolean> => {
    if (!shot) return false;
    const blob = await toBlob(shot.src);
    if (!blob) {
      setBlocked(true);
      return false;
    }
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      return true;
    } catch {
      setBlocked(true);
      return false;
    }
  };

  return (
    <ToolFrame name="Screenshot" cost={credits(COST.screenshot)}>
      <section className="section stack">
        <TargetCard target={target} />
        <Check checked={fullPage} onChange={setFullPage}>
          Full page, top to bottom, not just the first screen
        </Check>
        <p className="field-hint">
          Taken by a clean browser on the API side at 1440 pixels wide, with ads blocked: the public
          page, not your signed-in view of it.
        </p>
        <PageGate reach={reach} />
        <RunRow
          label="Take the screenshot"
          busyLabel="Rendering"
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

      {run.status === "done" && shot && (
        <section className="section stack">
          <div className="result-bar">
            <Button variant="solid" small onClick={() => copy(copyImage)}>
              <Icon name={copied ? "check" : "copy"} size={14} />
              <span aria-live="polite">{copied ? "Copied" : "Copy image"}</span>
            </Button>
            <Button small onClick={() => void save()}>
              <Icon name="download" size={14} />
              Save
            </Button>
            {/^https?:/.test(shot.src) && (
              <Out href={shot.src} className="btn btn--outline btn--small">
                <Icon name="external" size={14} />
                Open
              </Out>
            )}
          </div>
          <Meta meta={run.meta} />
          {blocked && (
            <Note tone="warn">
              The image host did not let the extension read the file. Open it in a tab and save it
              from there.
            </Note>
          )}
          <img className="shot" src={shot.src} alt={`Screenshot of ${host}`} />
        </section>
      )}
    </ToolFrame>
  );
}
