# Security

## Reporting a vulnerability

Email **hello@pluck.procd.cc** with a description, the affected version or URL, and steps to reproduce. Please do not open a public issue for anything exploitable.

You will get an acknowledgement within 3 working days and an assessment within 10. We will tell you when a fix ships and credit you in the release notes unless you would rather stay anonymous.

Scope for the hosted service: `pluck.procd.cc`, `pluck-api.procd.cc` and `pluck-mcp.procd.cc`. Please do not run load tests, use automated scanners against the hosted API, or attempt to access other accounts' data.

## What the service does to protect itself

- **Server-side request forgery.** Outbound requests resolve DNS at connect time and refuse private, loopback, link-local, carrier-NAT and cloud-metadata ranges. Each redirect hop is re-checked, and a rendered page's subresources are checked individually, so a page cannot pivot into the network the browser runs in.
- **Secrets.** API keys are stored only as SHA-256 hashes. Model-provider keys are encrypted with AES-256-GCM under a key that lives in the environment, and are never returned by the API or logged.
- **Account takeover.** GitHub sign-in requires a verified primary email. Identity is the GitHub account id, and linking accounts by matching email addresses is disabled.
- **Resource limits.** Response bodies are capped while streaming, pages run under a hard timeout, browser contexts are discarded after every render, and the browser process is recycled periodically.
- **Untrusted content.** Page text handed to a language model is wrapped and labelled as data. Treat extracted output as untrusted in your own systems too.
- **Supply chain.** Dependencies install with a three-day release cooldown, dependency build scripts are denied unless reviewed, transitive dependencies may not come from git or tarball URLs, and a trust-policy check fails the install if a package loses provenance.

## Self-hosting notes

- Set `PLUCK_ENCRYPTION_KEY` to a unique random value and back it up; losing it makes stored provider keys unreadable.
- Leave `ALLOW_PRIVATE_NETWORK=false` unless the instance is deliberately scraping hosts on your own network, and never on a shared or public instance.
- Put the API behind a rate limit (`RATE_LIMIT_PER_MINUTE`) if it is reachable from the internet.
- `BOOTSTRAP_API_KEY` is a full-access credential. Treat it like a root password, or leave it unset and use dashboard keys.
