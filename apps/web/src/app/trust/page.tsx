import type { Metadata } from "next";
import Link from "next/link";
import { SITE } from "@/lib/site";
import {
  CONTROLS,
  HOSTING,
  RETENTION,
  STANDARDS,
  STATUS_URL,
  type Standard,
  SUBPROCESSORS,
  TRUST_UPDATED,
} from "@/lib/trust";

export const metadata: Metadata = {
  title: "Trust",
  description: `How ${SITE.name} protects your data: security controls, subprocessors, retention and compliance status.`,
  alternates: { canonical: "/trust" },
};

const SECTIONS = [
  ["standards", "Compliance"],
  ["controls", "Security controls"],
  ["subprocessors", "Subprocessors"],
  ["retention", "Retention"],
  ["disclosure", "Report a vulnerability"],
] as const;

export default function TrustPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <header className="max-w-3xl">
        <p className="mono text-xs uppercase tracking-wider text-[var(--ink-faint)]">
          Trust centre
        </p>
        <h1 className="mt-2 text-4xl">What happens to your data, stated plainly</h1>
        <p className="mt-4 text-[var(--ink-soft)]">
          {SITE.name} is open source, so none of this needs to be taken on faith: every control
          below is in the{" "}
          <a href={SITE.repo} className="text-[var(--accent)] underline underline-offset-4">
            public repository
          </a>
          . Where we fall short of a formal standard, this page says so.
        </p>
        <p className="mt-3 text-sm text-[var(--ink-faint)]">Last reviewed {TRUST_UPDATED}</p>
      </header>

      <dl className="mt-10 grid gap-px overflow-hidden border border-[var(--line)] bg-[var(--line)] sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="Hosted in" value={HOSTING.region} detail={`on ${HOSTING.provider}`} />
        <Fact label="Encryption" value="TLS in transit" detail="AES-256 for stored secrets" />
        <Fact label="Sign-in" value="GitHub, verified email" detail="No passwords stored" />
        <Fact
          label="Status"
          value={
            <a
              href={STATUS_URL}
              className="inline-flex items-center gap-2 hover:text-[var(--accent)]"
              rel="noopener"
            >
              <span className="size-2 rounded-full bg-[var(--leaf)]" aria-hidden="true" />
              Live status page
            </a>
          }
          detail="Uptime of every public service"
        />
      </dl>

      <div className="mt-14 grid gap-12 lg:grid-cols-[12rem_1fr]">
        <nav aria-label="On this page" className="hidden lg:block">
          <ul className="sticky top-24 space-y-2 text-sm">
            {SECTIONS.map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`} className="text-[var(--ink-soft)] hover:text-[var(--ink)]">
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 space-y-16">
          <section id="standards" className="scroll-mt-24">
            <h2 className="text-2xl">Compliance</h2>
            <ul className="mt-5 divide-y divide-[var(--line)] border-y border-[var(--line)]">
              {STANDARDS.map((standard) => (
                <li
                  key={standard.name}
                  className="grid gap-2 py-4 sm:grid-cols-[10rem_7rem_1fr] sm:items-baseline"
                >
                  <span className="font-medium">{standard.name}</span>
                  <StatusBadge status={standard.status} />
                  <span className="text-sm text-[var(--ink-soft)]">{standard.note}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-[var(--ink-soft)]">
              Need a DPA or answers to a security questionnaire?{" "}
              <Link
                href="/enterprise"
                className="text-[var(--accent)] underline underline-offset-4"
              >
                Ask us
              </Link>
              .
            </p>
          </section>

          <section id="controls" className="scroll-mt-24">
            <h2 className="text-2xl">Security controls</h2>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {CONTROLS.map((group) => (
                <div key={group.title} className="sheet p-5">
                  <h3 className="mono text-xs uppercase tracking-wider text-[var(--ink-faint)]">
                    {group.title}
                  </h3>
                  <dl className="mt-3 space-y-4">
                    {group.items.map(([title, text]) => (
                      <div key={title}>
                        <dt className="text-sm font-medium">{title}</dt>
                        <dd className="mt-1 text-sm text-[var(--ink-soft)]">{text}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>
          </section>

          <section id="subprocessors" className="scroll-mt-24">
            <h2 className="text-2xl">Subprocessors</h2>
            <p className="mt-2 max-w-[65ch] text-sm text-[var(--ink-soft)]">
              Every third party that can see customer data, and what it sees. Changes are listed
              here.
            </p>
            <div className="sheet mt-5 overflow-x-auto">
              <table className="w-full min-w-[40rem] text-sm">
                <thead className="text-left text-xs text-[var(--ink-faint)]">
                  <tr>
                    {["Provider", "Purpose", "Data it receives", "Location"].map((h) => (
                      <th key={h} className="border-b border-[var(--line)] px-4 py-2 font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {SUBPROCESSORS.map((s) => (
                    <tr key={s.name} className="border-b border-[var(--line)] last:border-0">
                      <td className="px-4 py-3 font-medium whitespace-nowrap">{s.name}</td>
                      <td className="px-4 py-3 text-[var(--ink-soft)]">{s.purpose}</td>
                      <td className="px-4 py-3 text-[var(--ink-soft)]">{s.data}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-[var(--ink-soft)]">
                        {s.location}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-sm text-[var(--ink-soft)]">
              With your own model key, AI endpoints send page content to your provider instead of
              ours, under your agreement with them.
            </p>
          </section>

          <section id="retention" className="scroll-mt-24">
            <h2 className="text-2xl">Retention</h2>
            <p className="mt-2 max-w-[65ch] text-sm text-[var(--ink-soft)]">
              Deleted automatically, not by hand. Delete your account from the{" "}
              <Link href="/dashboard" className="text-[var(--accent)] underline underline-offset-4">
                dashboard
              </Link>{" "}
              and everything in it goes at once.
            </p>
            <dl className="mt-5 divide-y divide-[var(--line)] border-y border-[var(--line)] text-sm">
              {RETENTION.map(([what, how]) => (
                <div key={what} className="grid gap-1 py-3 sm:grid-cols-[14rem_1fr]">
                  <dt className="font-medium">{what}</dt>
                  <dd className="text-[var(--ink-soft)]">{how}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section id="disclosure" className="scroll-mt-24">
            <h2 className="text-2xl">Report a vulnerability</h2>
            <p className="mt-2 max-w-[65ch] text-sm text-[var(--ink-soft)]">
              Email{" "}
              <a
                href={`mailto:${SITE.contactEmail}?subject=Security`}
                className="text-[var(--accent)] underline underline-offset-4"
              >
                {SITE.contactEmail}
              </a>{" "}
              with "Security" in the subject. We aim to reply within two working days. Please give
              us a reasonable chance to fix an issue before disclosing it, and do not access other
              people's data or degrade the service while testing. Good-faith research within these
              rules is welcome.
            </p>
            <p className="mt-3 text-sm text-[var(--ink-soft)]">
              Machine-readable contact details are at{" "}
              <a
                href="/.well-known/security.txt"
                className="mono text-[var(--accent)] underline underline-offset-4"
              >
                /.well-known/security.txt
              </a>
              . See also the{" "}
              <Link
                href="/legal/privacy"
                className="text-[var(--accent)] underline underline-offset-4"
              >
                privacy policy
              </Link>{" "}
              and{" "}
              <Link
                href="/legal/terms"
                className="text-[var(--accent)] underline underline-offset-4"
              >
                terms
              </Link>
              .
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

function Fact({ label, value, detail }: { label: string; value: React.ReactNode; detail: string }) {
  return (
    <div className="bg-[var(--sheet)] p-5">
      <dt className="mono text-xs uppercase tracking-wider text-[var(--ink-faint)]">{label}</dt>
      <dd className="mt-2 font-medium">{value}</dd>
      <dd className="mt-1 text-sm text-[var(--ink-soft)]">{detail}</dd>
    </div>
  );
}

const BADGE: Record<Standard["status"], [string, string]> = {
  yes: ["Yes", "text-[var(--leaf)] border-[color-mix(in_srgb,var(--leaf)_40%,transparent)]"],
  partial: ["Partly", "text-[var(--ink)] border-[var(--line)]"],
  no: ["Not yet", "text-[var(--ink-faint)] border-[var(--line)]"],
};

function StatusBadge({ status }: { status: Standard["status"] }) {
  const [label, style] = BADGE[status];
  return <span className={`mono w-fit border px-2 py-0.5 text-xs ${style}`}>{label}</span>;
}
