import type { Metadata } from "next";
import packages from "@/lib/licenses.generated.json";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Licences",
  description: `Open-source licences and credits for ${SITE.name}.`,
  alternates: { canonical: "/legal/licenses" },
};

interface Package {
  name: string;
  version: string;
  license: string;
  url: string;
}

const OURS: [string, string, string][] = [
  [
    "The Pluck server, dashboard and MCP server",
    "AGPL-3.0",
    "Use, change and self-host it freely. If you offer a modified version as a network service, share your changes under the same licence.",
  ],
  [
    "The TypeScript SDK (@pluckai/sdk) and Python SDK (pluckai)",
    "MIT",
    "Embed them in anything, including closed-source software.",
  ],
];

/** Things we use that are not npm packages, credited by hand and checked against their sources. */
const CREDITS: { name: string; use: string; license: string; url: string }[] = [
  {
    name: "Lucide",
    use: "The icons throughout the site and dashboard",
    license: "ISC",
    url: "https://lucide.dev/license",
  },
  {
    name: "Bricolage Grotesque",
    use: "Headings",
    license: "SIL Open Font License 1.1",
    url: "https://fonts.google.com/specimen/Bricolage+Grotesque/license",
  },
  {
    name: "IBM Plex Sans and IBM Plex Mono",
    use: "Body text and code",
    license: "SIL Open Font License 1.1",
    url: "https://github.com/IBM/plex/blob/master/LICENSE.txt",
  },
  {
    name: "Chromium, driven by Playwright",
    use: "Rendering JavaScript-heavy pages and screenshots",
    license: "BSD-3-Clause and others (Chromium); Apache-2.0 (Playwright)",
    url: "https://www.chromium.org/chromium-projects/",
  },
  {
    name: "libvips, through sharp",
    use: "Resizing screenshots, logos and profile pictures",
    license: "LGPL-3.0-or-later, dynamically linked",
    url: "https://github.com/libvips/libvips",
  },
  {
    name: "PostgreSQL",
    use: "The database",
    license: "PostgreSQL License",
    url: "https://www.postgresql.org/about/licence/",
  },
  {
    name: "Redis",
    use: "Queues and caching",
    license: "AGPL-3.0, one of its three licences",
    url: "https://redis.io/legal/licenses/",
  },
  {
    name: "SearXNG",
    use: "Web search on self-hosted instances",
    license: "AGPL-3.0",
    url: "https://github.com/searxng/searxng",
  },
  {
    name: "SeaweedFS",
    use: "Object storage on self-hosted instances",
    license: "Apache-2.0",
    url: "https://github.com/seaweedfs/seaweedfs",
  },
];

export default function LicensesPage() {
  const list = packages as Package[];
  const groups = new Map<string, Package[]>();
  for (const pkg of list) groups.set(pkg.license, [...(groups.get(pkg.license) ?? []), pkg]);
  const byLicense = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);

  return (
    <div className="mx-auto max-w-6xl space-y-14 px-4 py-14 sm:px-6">
      <header>
        <h1 className="text-4xl">Licences</h1>
        <p className="mt-4 text-[var(--ink-soft)]">
          {SITE.name} is open source and stands on a great deal of other open-source work. This page
          lists our own licences, credits the projects we build on, and names every third-party
          package a production install contains.
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="text-2xl">{SITE.name}</h2>
        <ul className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
          {OURS.map(([what, license, note]) => (
            <li key={what} className="grid gap-2 py-4 sm:grid-cols-[1fr_8rem] sm:items-baseline">
              <div>
                <p className="font-medium">{what}</p>
                <p className="mt-1 text-sm text-[var(--ink-soft)]">{note}</p>
              </div>
              <span className="mono w-fit border border-[var(--line)] px-2 py-0.5 text-xs sm:justify-self-end">
                {license}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-sm text-[var(--ink-soft)]">
          The full texts are in the{" "}
          <a href={SITE.repo} className="text-[var(--accent)] underline underline-offset-4">
            repository
          </a>
          .
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl">Credits</h2>
        <div className="sheet overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="text-left text-xs text-[var(--ink-faint)]">
              <tr>
                {["Project", "Used for", "Licence"].map((h) => (
                  <th key={h} className="border-b border-[var(--line)] px-4 py-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CREDITS.map((credit) => (
                <tr key={credit.name} className="border-b border-[var(--line)] last:border-0">
                  <td className="px-4 py-3">
                    <a
                      href={credit.url}
                      rel="noopener"
                      className="font-medium hover:text-[var(--accent)]"
                    >
                      {credit.name}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-[var(--ink-soft)]">{credit.use}</td>
                  <td className="px-4 py-3 text-[var(--ink-soft)]">{credit.license}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-sm text-[var(--ink-soft)]">
          The GitHub, OpenAI and Anthropic logos are trademarks of their owners, shown only to
          identify sign-in and the model providers you can connect; they imply no endorsement. The
          hero background is original work.
        </p>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-2xl">Third-party packages</h2>
          <p className="mt-2 text-sm text-[var(--ink-soft)]">
            {list.length} packages are installed with a production build of the web app, API, worker
            and MCP server, generated from their dependency trees, including the platform-specific
            builds of native modules. Each is used under the licence shown; select one to see its
            packages.
          </p>
        </div>
        <div className="space-y-2">
          {byLicense.map(([license, items]) => (
            <details key={license} className="sheet group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm marker:hidden">
                <span className="font-medium">{license}</span>
                <span className="mono text-xs text-[var(--ink-faint)]">
                  {items.length} {items.length === 1 ? "package" : "packages"}
                </span>
              </summary>
              <ul className="grid gap-x-6 gap-y-1 border-t border-[var(--line)] px-4 py-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                {items.map((pkg) => (
                  <li key={pkg.name} className="flex min-w-0 items-baseline gap-2">
                    <a
                      href={pkg.url}
                      rel="noopener"
                      className="truncate hover:text-[var(--accent)]"
                    >
                      {pkg.name}
                    </a>
                    <span className="mono shrink-0 text-xs text-[var(--ink-faint)]">
                      {pkg.version}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
