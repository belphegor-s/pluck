import { useCallback, useEffect, useMemo, useState } from "react";
import { CONFIG, site } from "../lib/config";
import { beginConnect } from "../lib/connect";
import { downloadText, formatNumber, newId, timeAgo } from "../lib/format";
import { displayUrl, hostOf } from "../lib/page";
import { addHistory, clearHistory, KEYS } from "../lib/storage";
import {
  DEFAULT_SETTINGS,
  type HistoryEntry,
  type Intent,
  type Settings,
  type ToolId,
} from "../lib/types";
import { applyTheme, Button, CopyButton, Icon, IconButton, Logo, Note, Out } from "../ui/kit";
import { CodeView, JsonView, ProblemNote, TargetCard, ToolFrame } from "./parts";
import { SignedOut } from "./SignedOut";
import {
  Panel,
  type PanelContext,
  useAccount,
  useHistory,
  useIntent,
  useStored,
  useTarget,
  useUsage,
  useWindowId,
} from "./state";
import { BrandTool } from "./tools/Brand";
import { ExtractTool } from "./tools/Extract";
import { MapTool } from "./tools/MapTool";
import { MarkdownTool } from "./tools/Markdown";
import { TOOLS, toolName } from "./tools/registry";
import { ScreenshotTool } from "./tools/Screenshot";
import { SearchTool } from "./tools/Search";
import { StyleguideTool } from "./tools/Styleguide";

const TOOL_VIEWS: Record<ToolId, () => React.ReactNode> = {
  markdown: MarkdownTool,
  extract: ExtractTool,
  brand: BrandTool,
  styleguide: StyleguideTool,
  map: MapTool,
  screenshot: ScreenshotTool,
  search: SearchTool,
};

type View =
  | { name: "menu" }
  | { name: "tool"; id: ToolId }
  | { name: "saved"; entry: HistoryEntry };

/** Below this many credits the balance turns amber: a run or two is left. */
const LOW_BALANCE = 25;

export function App() {
  const [account, accountLoaded] = useAccount();
  const [stored, settingsLoaded] = useStored<Partial<Settings>>("local", KEYS.settings, {});
  const settings = useMemo<Settings>(() => ({ ...DEFAULT_SETTINGS, ...stored }), [stored]);
  const windowId = useWindowId();
  const target = useTarget(windowId);
  const usage = useUsage(account);
  const history = useHistory();
  const [view, setView] = useState<View>({ name: "menu" });
  const [intent, setIntent] = useState<Intent | null>(null);

  useEffect(() => applyTheme(settings.theme), [settings.theme]);

  // A menu click or shortcut opens its tool; the tool then picks the request up.
  useIntent(windowId, (next) => {
    setIntent(next);
    setView({ name: "tool", id: next.tool });
  });

  const back = useCallback(() => setView({ name: "menu" }), []);
  const consumeIntent = useCallback(() => setIntent(null), []);
  const { refresh } = usage;

  // Unknown until the first answer: assume prices apply on the hosted service.
  const billing = usage.balance === undefined ? account?.via === "connect" : usage.balance !== null;

  const context = useMemo<PanelContext | null>(
    () =>
      account && {
        account,
        settings,
        target,
        billing,
        refreshUsage: refresh,
        record: (entry) => void addHistory({ ...entry, id: newId(), at: Date.now() }),
        intent,
        consumeIntent,
        reconnect: () =>
          void (account.via === "connect" ? beginConnect() : chrome.runtime.openOptionsPage()),
        back,
      },
    [account, settings, target, billing, refresh, intent, consumeIntent, back],
  );

  if (!accountLoaded || !settingsLoaded) return null;
  if (!account || !context)
    return (
      <div className="app">
        <SignedOut target={target} />
      </div>
    );

  const Tool = view.name === "tool" ? TOOL_VIEWS[view.id] : null;

  return (
    <Panel.Provider value={context}>
      <div className="app">
        {Tool && <Tool />}
        {view.name === "saved" && (
          <Saved entry={view.entry} onOpen={() => setView({ name: "tool", id: view.entry.tool })} />
        )}
        {view.name === "menu" && (
          <>
            <header className="bar">
              <Out href={site("/dashboard")} className="wordmark">
                <Logo />
                {CONFIG.name}
              </Out>
              <span className="bar-spacer" />
              {usage.balance === null && <span className="pill">self-hosted</span>}
              {typeof usage.balance === "number" && (
                <Out
                  href={site("/dashboard/billing")}
                  className={`pill${usage.balance < LOW_BALANCE ? " pill--low" : ""}`}
                >
                  {formatNumber(usage.balance)} credits
                </Out>
              )}
              <IconButton
                label="Settings"
                icon="gear"
                onClick={() => void chrome.runtime.openOptionsPage()}
              />
            </header>

            {usage.problem && (
              <section className="section">
                <ProblemNote problem={usage.problem} />
              </section>
            )}

            <section className="section">
              <span className="label">On this tab</span>
              <TargetCard target={target} />
            </section>

            <nav className="menu" aria-label="Tools">
              {TOOLS.map((tool) => (
                <button
                  key={tool.id}
                  type="button"
                  className="menu-item"
                  onClick={() => setView({ name: "tool", id: tool.id })}
                >
                  {billing ? (
                    <span className="leaders">
                      <span className="menu-name">{tool.name}</span>
                      <span className="menu-cost">{tool.cost}</span>
                    </span>
                  ) : (
                    <span className="menu-name">{tool.name}</span>
                  )}
                  <span className="menu-blurb">{tool.blurb}</span>
                </button>
              ))}
            </nav>

            {history.length > 0 && (
              <section>
                <div className="section row">
                  <span className="label grow">Recent</span>
                  <button type="button" className="link" onClick={() => void clearHistory()}>
                    Clear
                  </button>
                </div>
                <div>
                  {history.slice(0, 6).map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      className="history-item"
                      onClick={() => setView({ name: "saved", entry })}
                    >
                      <span className="history-tool">{toolName(entry.tool)}</span>
                      <span className="grow truncate">{entry.title || displayUrl(entry.url)}</span>
                      <span className="mono faint">{timeAgo(entry.at)}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            <footer className="foot">
              <span className="grow truncate">
                {account.workspace?.name ?? hostOf(account.apiUrl)}
              </span>
              {account.via === "connect" && <Out href={site("/dashboard")}>Dashboard</Out>}
              <Out href={site("/docs/extension")}>Help</Out>
            </footer>
          </>
        )}
      </div>
    </Panel.Provider>
  );
}

/** A past result, reopened from the recent list to copy or save again. */
function Saved({ entry, onOpen }: { entry: HistoryEntry; onOpen: () => void }) {
  const isLink = entry.tool === "screenshot" && /^https?:/.test(entry.text ?? "");
  const isJson = entry.filename.endsWith(".json");
  return (
    <ToolFrame name={toolName(entry.tool)}>
      <section className="section stack">
        <div>
          <p className="target-title">{entry.title || displayUrl(entry.url)}</p>
          <p className="target-url truncate">
            {displayUrl(entry.url)} {entry.url && "·"} {timeAgo(entry.at)}
          </p>
        </div>
        {!entry.text && (
          <Note>
            This result was too large to keep on this device. Run it again to get it back.
          </Note>
        )}
        {entry.text && isLink && (
          <>
            <div className="result-bar">
              <Out href={entry.text} className="btn btn--solid btn--small">
                <Icon name="external" size={14} />
                Open image
              </Out>
              <CopyButton text={entry.text} label="Copy link" />
            </div>
            <img className="shot" src={entry.text} alt={`Screenshot of ${hostOf(entry.url)}`} />
          </>
        )}
        {entry.text && !isLink && (
          <>
            <div className="result-bar">
              <CopyButton text={entry.text} variant="solid" />
              <Button
                small
                onClick={() =>
                  downloadText(
                    entry.text ?? "",
                    entry.filename,
                    isJson ? "application/json" : "text/plain",
                  )
                }
              >
                <Icon name="download" size={14} />
                Save
              </Button>
            </div>
            {isJson ? <JsonView text={entry.text} /> : <CodeView>{entry.text}</CodeView>}
          </>
        )}
        <Button onClick={onOpen}>Open {toolName(entry.tool)}</Button>
      </section>
    </ToolFrame>
  );
}
