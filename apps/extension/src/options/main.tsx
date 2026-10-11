import { type ReactNode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "../ui/app.css";
import { explain } from "../lib/api";
import { CONFIG, site } from "../lib/config";
import { beginConnect, connectWithKey, disconnect, normalizeApiUrl } from "../lib/connect";
import { formatNumber } from "../lib/format";
import { hostOf } from "../lib/page";
import { clearHistory, KEYS, saveSettings } from "../lib/storage";
import { DEFAULT_SETTINGS, type MarkdownSource, type Settings, type Theme } from "../lib/types";
import { useAccount, useHistory, useStored } from "../panel/state";
import { applyTheme, Button, Check, Field, Logo, Note, Out, Segmented } from "../ui/kit";

const THEMES: readonly { value: Theme; label: string }[] = [
  { value: "auto", label: "Match the system" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

const SOURCES: readonly { value: MarkdownSource; label: string }[] = [
  { value: "remote", label: "Fetch the page" },
  { value: "live", label: "This tab as I see it" },
];

function Section({
  title,
  lede,
  children,
}: {
  title: string;
  lede?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      {lede && <p>{lede}</p>}
      <div className="panel-body stack">{children}</div>
    </section>
  );
}

/** Shown once, in the tab that opens after installing. */
function Welcome({ connected, onConnect }: { connected: boolean; onConnect: () => void }) {
  return (
    <div className="sheet welcome">
      <h2>{CONFIG.name} is installed.</h2>
      <p>Three steps and the page in front of you is ready for a model.</p>
      <ol className="steps">
        <li>
          <span>
            <strong>Pin it</strong>
            Open the puzzle-piece menu in the toolbar and pin {CONFIG.name}, so it is one click
            away.
          </span>
        </li>
        <li>
          <span>
            <strong>{connected ? "Connected" : "Connect your account"}</strong>
            {connected ? (
              "Your account is linked to this browser."
            ) : (
              <>
                Sign in on the site, or create an account there
                {CONFIG.signupGrant > 0 &&
                  `: ${formatNumber(CONFIG.signupGrant)} free credits, no card`}
                .
                <span className="row panel-body">
                  <Button variant="accent" onClick={onConnect}>
                    Connect your account
                  </Button>
                </span>
              </>
            )}
          </span>
        </li>
        <li>
          <span>
            <strong>Open any page and click the {CONFIG.name} button</strong>
            Or press <kbd>Alt</kbd> <kbd>Shift</kbd> <kbd>P</kbd>. Right-clicking a page, a link or
            a selection works too.
          </span>
        </li>
      </ol>
    </div>
  );
}

function Account() {
  const [account] = useAccount();
  const [waiting, setWaiting] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (account) setWaiting(false);
  }, [account]);

  if (!account)
    return (
      <Section
        title="Account"
        lede={`Accounts live on ${hostOf(CONFIG.siteUrl)}. Connecting opens the site, where you sign in or sign up, and gives this browser an API key of its own.`}
      >
        <div className="row">
          <Button
            variant="accent"
            onClick={() => {
              setWaiting(true);
              void beginConnect();
            }}
          >
            Connect your account
          </Button>
        </div>
        {waiting && (
          <Note tone="good" title="Finish in the tab that just opened">
            This page updates by itself once you approve.
          </Note>
        )}
      </Section>
    );

  return (
    <Section title="Account">
      <dl className="facts">
        {account.workspace && (
          <>
            <dt>Workspace</dt>
            <dd>{account.workspace.name}</dd>
          </>
        )}
        {account.user && (
          <>
            <dt>Signed in as</dt>
            <dd>{account.user.email}</dd>
          </>
        )}
        <dt>Instance</dt>
        <dd className="mono">{account.apiUrl.replace(/^https?:\/\//, "")}</dd>
        <dt>Key</dt>
        <dd className="mono">{account.apiKey.slice(0, 12)}…</dd>
      </dl>
      <div className="row row--wrap">
        {account.via === "connect" && (
          <Out href={site("/dashboard")} className="btn btn--outline">
            Open the dashboard
          </Out>
        )}
        <Button
          busy={leaving}
          onClick={() => {
            setLeaving(true);
            void disconnect().finally(() => setLeaving(false));
          }}
        >
          {account.via === "connect" ? "Sign out and revoke this key" : "Forget this key"}
        </Button>
      </div>
    </Section>
  );
}

/** A pasted key: the way in for an instance someone runs themselves. */
function OwnInstance() {
  const [account] = useAccount();
  const [url, setUrl] = useState("");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    const apiUrl = normalizeApiUrl(url);
    setSaved(false);
    if (!apiUrl) {
      setError("Enter the address of the API, such as https://pluck-api.example.com.");
      return;
    }
    if (!key.trim()) {
      setError("Paste an API key.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await connectWithKey(apiUrl, key);
      setSaved(true);
      setKey("");
    } catch (err) {
      const problem = explain(err);
      setError(
        problem.action === "reconnect"
          ? "That instance did not accept the key."
          : `${problem.title}. ${problem.detail}`,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      title="Your own instance"
      lede={`${CONFIG.name} is open source. If you run it yourself, point the extension at your API and paste a key: nothing then goes anywhere but your server.`}
    >
      <Field label="API address">
        <input
          className="input mono"
          value={url}
          placeholder={account?.via === "key" ? account.apiUrl : "http://localhost:8080"}
          spellCheck={false}
          autoCapitalize="none"
          onChange={(e) => setUrl(e.target.value)}
        />
      </Field>
      <Field
        label="API key"
        hint="Stored in this browser only. On a fresh self-hosted stack this is BOOTSTRAP_API_KEY."
      >
        <input
          className="input mono"
          type="password"
          value={key}
          placeholder={`${CONFIG.keyPrefix}live_…`}
          autoComplete="off"
          onChange={(e) => setKey(e.target.value)}
        />
      </Field>
      <div className="row">
        <Button variant="solid" busy={busy} onClick={() => void save()}>
          {busy ? "Checking" : "Check and save"}
        </Button>
      </div>
      {error && <Note tone="error">{error}</Note>}
      {saved && <Note tone="good">Connected. The key answered and is saved.</Note>}
    </Section>
  );
}

function Preferences({ settings }: { settings: Settings }) {
  const [denied, setDenied] = useState(false);

  const follow = async (on: boolean) => {
    setDenied(false);
    if (!on) {
      await saveSettings({ followTabs: false });
      await chrome.permissions.remove({ permissions: ["tabs"] }).catch(() => false);
      return;
    }
    // The browser asks the person here; nothing is granted without their yes.
    const granted = await chrome.permissions.request({ permissions: ["tabs"] }).catch(() => false);
    if (granted) await saveSettings({ followTabs: true });
    else setDenied(true);
  };

  return (
    <>
      <Section title="Reading pages">
        <Field label="Markdown reads from">
          <Segmented
            name="source"
            label="Default source for markdown"
            value={settings.markdownSource}
            options={SOURCES}
            onChange={(markdownSource) => void saveSettings({ markdownSource })}
          />
        </Field>
        <Check
          checked={settings.mainContentOnly}
          onChange={(mainContentOnly) => void saveSettings({ mainContentOnly })}
        >
          Main content only: leave out menus, sidebars and footers
        </Check>
        <Check checked={settings.followTabs} onChange={(on) => void follow(on)}>
          Follow the tab I am looking at
          <span className="field-hint">
            <br />
            Off, {CONFIG.name} only knows about a tab once you click its button there. On, the panel
            keeps up as you switch tabs. The browser will ask for permission to see the address and
            title of your tabs; they are shown in the panel and used when you run a tool, and are
            never sent anywhere otherwise.
          </span>
        </Check>
        {denied && (
          <Note tone="warn">
            The permission was not granted, so this stays off. Everything else works the same.
          </Note>
        )}
      </Section>

      <Section title="Appearance">
        <Segmented
          name="theme"
          label="Theme"
          value={settings.theme}
          options={THEMES}
          onChange={(theme) => void saveSettings({ theme })}
        />
      </Section>
    </>
  );
}

function Recent({ settings }: { settings: Settings }) {
  const history = useHistory();
  return (
    <Section
      title="Recent results"
      lede="The last 25 results are kept on this device so you can copy them again. They never leave it."
    >
      <Check
        checked={settings.keepHistory}
        onChange={(keepHistory) => {
          void saveSettings({ keepHistory });
          if (!keepHistory) void clearHistory();
        }}
      >
        Keep recent results
      </Check>
      <div className="row">
        <Button disabled={history.length === 0} onClick={() => void clearHistory()}>
          {history.length === 0 ? "Nothing kept" : `Clear ${history.length} kept`}
        </Button>
      </div>
    </Section>
  );
}

function Options() {
  const [account] = useAccount();
  const [stored, loaded] = useStored<Partial<Settings>>("local", KEYS.settings, {});
  const settings = useMemo<Settings>(() => ({ ...DEFAULT_SETTINGS, ...stored }), [stored]);
  const welcome = useMemo(() => new URLSearchParams(location.search).has("welcome"), []);

  useEffect(() => applyTheme(settings.theme), [settings.theme]);

  if (!loaded) return null;
  return (
    <div className="page-wrap">
      <header className="page-head">
        <Logo size={28} />
        <h1>{CONFIG.name} settings</h1>
      </header>

      {welcome && <Welcome connected={Boolean(account)} onConnect={() => void beginConnect()} />}

      <Account />
      <Preferences settings={settings} />
      <Recent settings={settings} />
      <OwnInstance />

      <Section title="Shortcuts">
        <dl className="facts">
          <dt>
            <kbd>Alt</kbd> <kbd>Shift</kbd> <kbd>P</kbd>
          </dt>
          <dd>Open {CONFIG.name} on the current tab</dd>
          <dt>
            <kbd>Alt</kbd> <kbd>Shift</kbd> <kbd>M</kbd>
          </dt>
          <dd>Pluck the current page as markdown</dd>
        </dl>
        <div className="row">
          <Button onClick={() => void chrome.tabs.create({ url: "chrome://extensions/shortcuts" })}>
            Change shortcuts
          </Button>
        </div>
      </Section>

      <Section title="About">
        <p className="soft">
          {CONFIG.name} {CONFIG.version}. The extension only acts when you ask it to: it reads a
          page when you run a tool on it, and sends that page to the API under your key. No
          analytics, no background reading, no browsing history.
        </p>
        <div className="row row--wrap">
          <Out href={site("/docs/extension")} className="link">
            Help
          </Out>
          <Out href={site("/legal/privacy")} className="link">
            Privacy
          </Out>
          <Out href={CONFIG.repoUrl} className="link">
            Source code
          </Out>
          <Out href={`mailto:${CONFIG.contactEmail}`} className="link">
            {CONFIG.contactEmail}
          </Out>
        </div>
      </Section>
    </div>
  );
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<Options />);
