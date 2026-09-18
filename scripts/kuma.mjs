#!/usr/bin/env node
/**
 * Configures the Uptime Kuma instance deployed by scripts/observability.mjs:
 * creates the admin account on first run, adds a monitor per public surface,
 * and publishes a status page.
 *
 *   node scripts/kuma.mjs
 *
 * Kuma has no REST API — the UI talks socket.io — so this speaks engine.io
 * over the WebSocket built into Node. That is less code than it sounds: four
 * frame types, and every call is one emit with an acknowledgement.
 */
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_PATH = join(ROOT, ".env");
const env = {};
for (const line of readFileSync(ENV_PATH, "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m) env[m[1]] = m[2];
}

const STATUS_URL = env.STATUS_URL ?? "https://pluck-status.procd.cc";
const USERNAME = env.KUMA_USERNAME ?? "admin";
const PASSWORD = env.KUMA_PASSWORD || randomBytes(12).toString("base64url");

/** Minimal socket.io v4 client: connect, emit with ack, close. */
class Socket {
  #ws;
  #acks = new Map();
  #nextAck = 1;
  #events = new Map();

  static connect(url) {
    return new Promise((resolve, reject) => {
      const socket = new Socket();
      const ws = new WebSocket(
        `${url.replace(/^http/, "ws")}/socket.io/?EIO=4&transport=websocket`,
      );
      socket.#ws = ws;
      ws.onerror = (event) => reject(new Error(`websocket error: ${event.message ?? "failed"}`));
      ws.onclose = () => {
        for (const [, { reject: fail }] of socket.#acks) fail(new Error("socket closed"));
        socket.#acks.clear();
      };
      ws.onmessage = ({ data }) => {
        const text = typeof data === "string" ? data : "";
        if (text.startsWith("0")) {
          // Handshake: answer with a namespace connect, then wait for its ack.
          ws.send("40");
          return;
        }
        if (text === "2") return ws.send("3"); // ping/pong
        if (text.startsWith("40")) return resolve(socket);
        const ack = /^43(\d+)(.*)$/s.exec(text);
        if (ack) {
          const pending = socket.#acks.get(Number(ack[1]));
          socket.#acks.delete(Number(ack[1]));
          pending?.resolve(JSON.parse(ack[2] || "[]")[0]);
          return;
        }
        const event = /^42(.*)$/s.exec(text);
        if (event) {
          const [name, payload] = JSON.parse(event[1]);
          socket.#events.set(name, payload);
        }
      };
      setTimeout(() => reject(new Error("timed out connecting to Kuma")), 20_000).unref?.();
    });
  }

  emit(name, ...args) {
    const id = this.#nextAck++;
    return new Promise((resolve, reject) => {
      this.#acks.set(id, { resolve, reject });
      this.#ws.send(`42${id}${JSON.stringify([name, ...args])}`);
      setTimeout(() => {
        if (this.#acks.delete(id)) reject(new Error(`${name} did not answer`));
      }, 30_000).unref?.();
    });
  }

  /** Server-pushed state, e.g. the monitor list that arrives after login. */
  seen(name) {
    return this.#events.get(name);
  }

  close() {
    this.#ws.close();
  }
}

const settle = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Everything Kuma should watch. Internal container names would skip the proxy
// and hide a broken certificate or a Cloudflare problem, so these are the
// public URLs a customer would hit.
const MONITORS = [
  { name: "API", url: `${env.PUBLIC_API_URL ?? "https://pluck-api.procd.cc"}/health` },
  { name: "Website", url: env.PUBLIC_WEB_URL ?? "https://pluck.procd.cc" },
  { name: "MCP", url: `${env.PUBLIC_MCP_URL ?? "https://pluck-mcp.procd.cc"}/health` },
  { name: "Docs", url: `${env.PUBLIC_API_URL ?? "https://pluck-api.procd.cc"}/openapi.json` },
];

const socket = await Socket.connect(STATUS_URL);
await settle(500);

// `needSetup` is pushed right after connecting on a fresh instance.
if (socket.seen("setup") === true || !env.KUMA_PASSWORD) {
  const setup = await socket.emit("setup", USERNAME, PASSWORD).catch((err) => ({
    ok: false,
    msg: err.message,
  }));
  console.log(setup?.ok ? "created admin account" : `admin account: ${setup?.msg}`);
}

const login = await socket.emit("login", { username: USERNAME, password: PASSWORD, token: "" });
if (!login?.ok) throw new Error(`login failed: ${login?.msg ?? "unknown reason"}`);
console.log(`signed in as ${USERNAME}`);
await settle(1_000);

/*
  Telegram first: a monitor created before the notification exists would not be
  attached to it, and Kuma only applies "default" notifications at creation.
*/
let notificationId = null;
if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
  const list = socket.seen("notificationList") ?? [];
  const found = list.find((n) => n.name === "Telegram");
  notificationId = found?.id ?? null;
  const saved = await socket
    .emit(
      "addNotification",
      {
        name: "Telegram",
        type: "telegram",
        isDefault: true,
        applyExisting: true,
        telegramBotToken: env.TELEGRAM_BOT_TOKEN,
        telegramChatID: env.TELEGRAM_CHAT_ID,
        telegramSendSilently: false,
        telegramProtectContent: false,
      },
      notificationId,
    )
    .catch((err) => ({ ok: false, msg: err.message }));
  notificationId = saved?.id ?? notificationId;
  console.log(saved?.ok ? "telegram notification saved" : `telegram: ${saved?.msg}`);
}

const existing = Object.values(socket.seen("monitorList") ?? {});
for (const monitor of MONITORS) {
  if (existing.some((m) => m.name === monitor.name)) {
    console.log(`= ${monitor.name}`);
    continue;
  }
  const added = await socket.emit("add", {
    type: "http",
    name: monitor.name,
    url: monitor.url,
    method: "GET",
    interval: 60,
    retryInterval: 60,
    maxretries: 2,
    timeout: 20,
    accepted_statuscodes: ["200-299"],
    expiryNotification: true,
    ignoreTls: false,
    upsideDown: false,
    maxredirects: 5,
    active: true,
    // Kuma attaches notifications by id at creation time.
    notificationIDList: notificationId ? { [notificationId]: true } : {},
  });
  console.log(added?.ok ? `+ ${monitor.name}` : `! ${monitor.name}: ${added?.msg}`);
}

// A status page makes the checks public, which is the point of running them.
const slug = "status";
// The published page answers over plain HTTP, which is a cheaper existence
// check than any socket call and matches what a visitor would see.
const exists = await fetch(`${STATUS_URL}/api/status-page/${slug}`)
  .then((r) => r.ok)
  .catch(() => false);
if (!exists) {
  const made = await socket.emit("addStatusPage", "Pluck Status", slug);
  console.log(made?.ok ? "created status page" : `status page: ${made?.msg}`);
}

await settle(500);
const monitorList = Object.values(socket.seen("monitorList") ?? {});
const saved = await socket
  .emit(
    "saveStatusPage",
    slug,
    {
      slug,
      title: "Pluck Status",
      description: "Live availability of the Pluck API, website and MCP server.",
      icon: "/icon.svg",
      theme: "auto",
      published: true,
      showTags: false,
      showPoweredBy: false,
      googleAnalyticsId: null,
      customCSS: "",
      footerText: null,
      showCertificateExpiry: true,
      // Kuma insists on an array here even when there are no custom domains.
      domainNameList: [],
    },
    // Kuma dereferences the icon argument, so it must be a path or data URL.
    "/icon.svg",
    [
      {
        name: "Services",
        monitorList: monitorList.map((m) => ({ id: m.id, name: m.name })),
      },
    ],
  )
  .catch((err) => ({ ok: false, msg: err.message }));
console.log(saved?.ok ? `published ${STATUS_URL}/status/${slug}` : `status page: ${saved?.msg}`);

// Visitors land on the status page rather than a login screen.
const entry = await socket
  .emit("setSettings", { entryPage: `statusPage-${slug}` }, PASSWORD)
  .catch((err) => ({ ok: false, msg: err.message }));
console.log(entry?.ok ? `${STATUS_URL} now opens the status page` : `entry page: ${entry?.msg}`);

if (!env.KUMA_PASSWORD) {
  let text = readFileSync(ENV_PATH, "utf8");
  text = `${text.replace(/\s*$/, "")}\nKUMA_USERNAME=${USERNAME}\nKUMA_PASSWORD=${PASSWORD}\n`;
  writeFileSync(ENV_PATH, text);
  console.log(`admin: ${USERNAME} / ${PASSWORD} (saved to .env)`);
}

socket.close();
