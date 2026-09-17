import type { Metadata } from "next";
import { ContactForm } from "@/components/contact-form";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Talk to us",
  description: `High volume, private deployments and invoicing for ${SITE.name}.`,
  alternates: { canonical: "/enterprise" },
};

export default function EnterprisePage() {
  return (
    <div className="mx-auto grid max-w-6xl gap-12 px-4 py-14 sm:px-6 lg:grid-cols-[0.9fr_1.1fr]">
      <div>
        <h1 className="text-4xl">Bigger than a credit pack?</h1>
        <p className="mt-4 text-[var(--ink-soft)]">
          Tell us what you are building and how much of the web you need. We reply from a real
          address, usually within a day.
        </p>
        <dl className="mt-8 space-y-5 text-sm">
          <div>
            <dt className="font-semibold">Volume pricing</dt>
            <dd className="mt-1 text-[var(--ink-soft)]">
              Millions of pages a month, priced per page rather than per pack.
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Private deployment</dt>
            <dd className="mt-1 text-[var(--ink-soft)]">
              Your cloud, your region, your egress IPs. We help you run it.
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Higher limits</dt>
            <dd className="mt-1 text-[var(--ink-soft)]">
              Raised rate limits, dedicated browser capacity, priority queues.
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Paperwork</dt>
            <dd className="mt-1 text-[var(--ink-soft)]">
              Invoicing, POs, a DPA and security review answers.
            </dd>
          </div>
        </dl>
        <p className="mt-8 text-sm text-[var(--ink-soft)]">
          Prefer email? Write to{" "}
          <a
            href={`mailto:${SITE.contactEmail}`}
            className="text-[var(--accent)] underline underline-offset-4"
          >
            {SITE.contactEmail}
          </a>
          .
        </p>
      </div>
      <ContactForm />
    </div>
  );
}
