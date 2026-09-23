/**
 * Facts about the hosted service, shown on /trust and summarised in the
 * privacy policy.
 *
 * Every line here is a claim a security reviewer may check, so each one is
 * true of the running deployment rather than of the code alone. Self-hosting?
 * Replace these with your own, or delete the page.
 */

export const TRUST_UPDATED = "23 September 2026";

export const STATUS_URL = "https://pluck-status.procd.cc";

export const HOSTING = {
  provider: "Hetzner",
  region: "Helsinki, Finland (EU)",
};

export interface Standard {
  name: string;
  status: "yes" | "partial" | "no";
  note: string;
}

/** Stated plainly: a small project claiming certifications it lacks is worse than none. */
export const STANDARDS: Standard[] = [
  {
    name: "Open source",
    status: "yes",
    note: "Every line that handles your data is public under AGPL-3.0. Read it, audit it, or run it yourself.",
  },
  {
    name: "GDPR",
    status: "partial",
    note: "Servers and backups are in the EU and personal data is kept to a minimum. A DPA is available on request; some subprocessors are outside the EU.",
  },
  {
    name: "SOC 2",
    status: "no",
    note: "Not audited. If you need a report today, self-host inside your own compliance boundary.",
  },
  {
    name: "ISO 27001",
    status: "no",
    note: "Not certified.",
  },
];

export interface ControlGroup {
  title: string;
  items: [string, string][];
}

export const CONTROLS: ControlGroup[] = [
  {
    title: "Access",
    items: [
      [
        "Sign-in with GitHub only",
        "No passwords to leak. Only a primary, verified email is accepted, and accounts are keyed on the GitHub user id, never on an email address, so an unverified email cannot take over an account.",
      ],
      [
        "API keys are hashed",
        "Stored as SHA-256 hashes and shown once. A database leak does not reveal a usable key. Revoke one in the dashboard and it stops working on the next request.",
      ],
      [
        "Operator access is gated",
        "The deployment control panel sits behind Cloudflare Access. Databases and queues are on a private network with no public ports.",
      ],
    ],
  },
  {
    title: "Data",
    items: [
      [
        "Encrypted in transit",
        "TLS on every public endpoint, terminated at Cloudflare, with HSTS so browsers never fall back to plain HTTP.",
      ],
      [
        "Encrypted at rest where it matters",
        "Model provider keys you save are encrypted with AES-256-GCM and never returned by the API. Object storage is encrypted with AES-256.",
      ],
      [
        "Secrets stay out of queues",
        "Background jobs carry ids, not payloads. A webhook's signing secret is read at send time, so it never sits in Redis.",
      ],
      [
        "No training, no resale",
        "Pages you fetch are not used to train models and are not shared beyond the subprocessors below.",
      ],
    ],
  },
  {
    title: "Application",
    items: [
      [
        "SSRF protection at connect time",
        "Every fetch, and every request a headless browser makes, is checked against private, loopback and link-local ranges after DNS resolution, so a hostname that resolves inward is refused.",
      ],
      [
        "Signed webhooks",
        "HMAC-SHA256 over the timestamp and body, with a five-minute replay window. Every delivery is logged and can be resent.",
      ],
      [
        "Validated input",
        "Every request is checked against a schema before it reaches a handler. Per-key rate limits apply to every endpoint.",
      ],
      [
        "Polite by default",
        "robots.txt is respected unless you turn it off for a request, which asserts you have permission.",
      ],
    ],
  },
  {
    title: "Operations",
    items: [
      [
        "Daily backups, off the host",
        "Postgres is dumped every day and copied to object storage, kept for 35 days.",
      ],
      [
        "Monitored",
        "Uptime checks on every public service, with alerts to the maintainer. The status page is public.",
      ],
      [
        "Errors stay in-house",
        "Error tracking is self-hosted, so stack traces and request details are not sent to a third-party vendor. There are no analytics or advertising scripts.",
      ],
      [
        "Checked changes",
        "Every change runs lint, type checks, tests and container builds in CI before it ships, from a pinned lockfile.",
      ],
    ],
  },
];

export const RETENTION: [string, string][] = [
  ["Cached pages", "Up to the maxAge you ask for; one hour by default"],
  ["Screenshots", "30 days"],
  ["Crawl results", "7 days"],
  ["Webhook delivery log", "30 days"],
  ["Monitor change history", "90 days"],
  ["Brand data cache", "90 days"],
  ["Usage records", "400 days, for billing disputes"],
  ["Backups", "35 days"],
  [
    "Your account",
    "Until you ask us to delete it; then everything tied to it is removed within 30 days",
  ],
];

export interface Subprocessor {
  name: string;
  purpose: string;
  data: string;
  location: string;
}

export const SUBPROCESSORS: Subprocessor[] = [
  {
    name: HOSTING.provider,
    purpose: "Servers, databases and queues",
    data: "Everything the service stores",
    location: "Finland",
  },
  {
    name: "Amazon Web Services",
    purpose: "Object storage for screenshots, logos and backups",
    data: "Screenshots, cached logos, database backups",
    location: "Frankfurt, Germany",
  },
  {
    name: "Cloudflare",
    purpose: "DNS, TLS and edge proxy",
    data: "Request metadata in transit",
    location: "Global edge",
  },
  {
    name: "GitHub",
    purpose: "Sign-in",
    data: "Your GitHub profile and verified email, at sign-in",
    location: "United States",
  },
  {
    name: "Polar",
    purpose: "Payments and invoices",
    data: "Billing details, only if you buy credits",
    location: "Merchant of record",
  },
  {
    name: "Resend",
    purpose: "Transactional email",
    data: "Your email address and the message",
    location: "United States",
  },
  {
    name: "OpenRouter",
    purpose: "Default model provider for AI endpoints",
    data: "Page content for extract, product, brand and classify calls, unless you bring your own key",
    location: "United States",
  },
  {
    name: "Serper",
    purpose: "Web search",
    data: "The search queries you send",
    location: "United States",
  },
];
