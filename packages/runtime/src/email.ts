import { request } from "undici";

/**
 * Transactional email over Resend's HTTP API.
 *
 * One `fetch`-shaped call, no SDK: the same reasoning as the error reporter —
 * a self-hostable service should not carry a vendor's dependency tree for four
 * fields. With no API key the mailer is inert and says so, which is what a
 * self-hoster without email wants.
 */
export interface Mailer {
  readonly enabled: boolean;
  send(message: Message): Promise<{ ok: boolean; error?: string }>;
}

export interface Message {
  to: string | string[];
  subject: string;
  text: string;
  replyTo?: string;
}

export interface MailerConfig {
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
}

const DEFAULT_FROM = "Pluck <hello@procd.cc>";

export function createMailer(config: MailerConfig): Mailer {
  const apiKey = config.RESEND_API_KEY;
  const from = config.EMAIL_FROM || DEFAULT_FROM;

  return {
    enabled: Boolean(apiKey),
    async send(message) {
      if (!apiKey) return { ok: false, error: "Email is not configured on this instance." };
      try {
        const res = await request("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            authorization: `Bearer ${apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            from,
            to: Array.isArray(message.to) ? message.to : [message.to],
            subject: message.subject,
            text: message.text,
            ...(message.replyTo ? { reply_to: message.replyTo } : {}),
          }),
          headersTimeout: 10_000,
          bodyTimeout: 10_000,
        });
        const body = (await res.body.json().catch(() => null)) as {
          id?: string;
          message?: string;
        } | null;
        if (res.statusCode >= 300) {
          return { ok: false, error: body?.message ?? `Resend returned HTTP ${res.statusCode}` };
        }
        return { ok: true };
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
    },
  };
}
