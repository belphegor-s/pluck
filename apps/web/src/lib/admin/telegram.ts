import "server-only";

/** One message to the operator's Telegram chat (HTML parse mode). Throws on failure. */
export async function sendTelegram(text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) throw new Error("Telegram is not configured.");
  // TELEGRAM_API_BASE is for a self-hosted Bot API server; almost everyone leaves it unset.
  const base = process.env.TELEGRAM_API_BASE || "https://api.telegram.org";
  const res = await fetch(`${base}/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Telegram answered ${res.status}.`);
}

/** For anything the client controls (IP header, user agent) inside a message. */
export const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
