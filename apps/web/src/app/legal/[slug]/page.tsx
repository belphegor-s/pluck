import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SITE } from "@/lib/site";

const UPDATED = "23 September 2026";

const pages = {
  terms: {
    title: "Terms of service",
    body: [
      [
        "Who we are",
        `${SITE.name} is operated as an independent open-source project. The hosted service at ${SITE.url} is run by the project maintainer. The software itself is licensed under AGPL-3.0 and you may run it yourself at any time.`,
      ],
      [
        "Your account",
        "You need a GitHub account with a verified email address. You are responsible for keeping your API keys secret and for everything done with them. Revoke a key in the dashboard the moment you suspect it has leaked.",
      ],
      [
        "Credits",
        "Credits are prepaid and are consumed as you make calls. They do not expire and there is no subscription. Failed calls are refunded automatically. Credits have no cash value and are not refundable once spent, though we will make it right if a defect on our side burned them.",
      ],
      [
        "Acceptable use",
        "Use the service for content you are allowed to access. Do not use it to bypass authentication, to collect personal data unlawfully, to infringe copyright, to attack a site through volume, or to build anything illegal. We respect robots.txt by default; if you turn that off you are asserting that you have permission. We may suspend an account that is causing harm, and will tell you why.",
      ],
      [
        "Availability",
        "We aim to keep the service up and fast, but it is offered as is, without warranty. We are not liable for indirect or consequential losses, and our total liability is limited to what you paid us in the previous three months.",
      ],
      [
        "Changes",
        "We may update these terms; material changes will be announced on this page and, for account holders, by email. Continuing to use the service after a change means you accept it.",
      ],
    ],
  },
  privacy: {
    title: "Privacy",
    body: [
      [
        "What we store",
        "Your GitHub account id, name, avatar and verified email; hashed API keys; credit and usage records (endpoint, target URL, status, credits, duration); and the content of pages you asked us to fetch, only for as long as caching and job retention require.",
      ],
      [
        "What we do not do",
        "We do not sell your data, we do not use your scraped content to train models, and we do not share it with anyone except the infrastructure providers needed to run the service.",
      ],
      [
        "Model providers",
        "AI endpoints send page content to a model provider. If you add your own provider key, that content goes to your account with them, under their terms. Provider keys you store are encrypted with AES-256-GCM and are never returned by the API.",
      ],
      [
        "Retention",
        "Cached pages expire within hours. Crawl results are deleted after 7 days, the webhook delivery log after 30 days, screenshots after 30 days, monitor history after 90 days, usage records after 400 days and backups after 35 days. Delete your account from the dashboard and everything tied to it is removed at once, and from backups within 35 days.",
      ],
      [
        "Subprocessors",
        `Servers and databases with Hetzner in Finland, object storage and backups with AWS in Frankfurt, Cloudflare for DNS and TLS, GitHub for sign-in, Polar for payments, Resend for email, OpenRouter as the default model provider for AI endpoints, and Serper for search. The full list, with what each one receives, is on the trust page: ${SITE.url}/trust.`,
      ],
      [
        "Your rights",
        `Ask for a copy of your data, a correction, or deletion by writing to ${SITE.contactEmail}. We answer within 30 days.`,
      ],
      [
        "Cookies",
        "One session cookie so you stay signed in, and a theme preference stored in your browser. No advertising or tracking cookies.",
      ],
    ],
  },
} as const;

type Slug = keyof typeof pages;

export function generateStaticParams() {
  return Object.keys(pages).map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = pages[slug as Slug];
  if (!page) return { title: "Not found" };
  return { title: page.title, alternates: { canonical: `/legal/${slug}` } };
}

export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = pages[slug as Slug];
  if (!page) notFound();

  return (
    <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <h1 className="text-4xl">{page.title}</h1>
      <p className="mt-2 text-sm text-[var(--ink-faint)]">Last updated {UPDATED}</p>
      <div className="prose-pluck mt-8">
        {page.body.map(([heading, text]) => (
          <section key={heading}>
            <h2>{heading}</h2>
            <p>{text}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
