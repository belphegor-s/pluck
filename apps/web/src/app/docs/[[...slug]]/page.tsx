import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyCodeButtons } from "@/components/copy-code";
import { ScrollTabs } from "@/components/scroll-tabs";
import { docsNav, listDocSlugs, readDoc } from "@/lib/docs";
import { SITE } from "@/lib/site";

type Params = { slug?: string[] };

export async function generateStaticParams() {
  const slugs = await listDocSlugs();
  return slugs.map((slug) => ({ slug: slug ? [slug] : [] }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const doc = await readDoc(slug?.[0] ?? "");
  if (!doc) return { title: "Not found" };
  const path = slug?.[0] ? `/docs/${slug[0]}` : "/docs";
  return {
    title: doc.title,
    description: `${doc.title} — ${SITE.name} documentation.`,
    alternates: { canonical: path },
    openGraph: { title: `${doc.title} — ${SITE.name}`, url: path },
  };
}

export default async function DocsPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const current = slug?.[0] ?? "";
  const doc = await readDoc(current);
  if (!doc) notFound();

  const index = docsNav.findIndex((d) => d.slug === current);
  const previous = index > 0 ? docsNav[index - 1] : null;
  const next = index >= 0 && index < docsNav.length - 1 ? docsNav[index + 1] : null;

  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
      {/*
        A column on a desktop, a scrolling strip of chips on a phone: a sidebar
        stacked above the article would push the page itself out of sight.
      */}
      <nav
        aria-label="Documentation"
        className="-mx-4 border-b border-[var(--line)] px-4 pb-3 sm:-mx-6 sm:px-6 lg:mx-0 lg:sticky lg:top-20 lg:self-start lg:border-0 lg:px-0 lg:pb-0"
      >
        <p className="hidden text-sm font-semibold lg:block">Documentation</p>
        {/* One scrolling line on small screens; a plain column once the
            sidebar has room. */}
        <ScrollTabs label="documentation" className="text-sm lg:hidden">
          {docsNav.map((item) => {
            const href = item.slug ? `/docs/${item.slug}` : "/docs";
            const active = item.slug === current;
            return (
              <Link
                key={item.slug}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`shrink-0 snap-start whitespace-nowrap border px-3 py-1.5 transition-colors ${
                  active
                    ? "border-[var(--accent)] text-[var(--accent)]"
                    : "border-[var(--line)] text-[var(--ink-soft)] hover:text-[var(--ink)]"
                }`}
              >
                {item.title}
              </Link>
            );
          })}
        </ScrollTabs>
        <ul className="mt-3 hidden flex-col gap-1.5 text-sm lg:flex">
          {docsNav.map((item) => {
            const href = item.slug ? `/docs/${item.slug}` : "/docs";
            const active = item.slug === current;
            return (
              <li key={item.slug}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={
                    active
                      ? "text-[var(--accent)]"
                      : "text-[var(--ink-soft)] transition-colors hover:text-[var(--ink)]"
                  }
                >
                  {item.title}
                </Link>
              </li>
            );
          })}
        </ul>
        <p className="mt-4 hidden text-sm lg:mt-6 lg:block">
          <Link
            href={`${SITE.apiUrl}/docs`}
            className="text-[var(--ink-soft)] transition-colors hover:text-[var(--ink)]"
            target="_blank"
            rel="noreferrer"
          >
            API reference
          </Link>
        </p>
      </nav>

      <article>
        <h1 className="text-3xl">{doc.title}</h1>
        {/* Content is our own markdown, compiled at build time. */}
        <div
          id="doc-body"
          className="prose-pluck mt-6"
          dangerouslySetInnerHTML={{ __html: doc.html }}
        />
        <CopyCodeButtons containerId="doc-body" />

        <div className="mt-14 flex justify-between gap-4 border-t border-[var(--line)] pt-5 text-sm">
          {previous ? (
            <Link
              href={previous.slug ? `/docs/${previous.slug}` : "/docs"}
              className="text-[var(--ink-soft)] hover:text-[var(--ink)]"
            >
              ← {previous.title}
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link
              href={`/docs/${next.slug}`}
              className="text-[var(--ink-soft)] hover:text-[var(--ink)]"
            >
              {next.title} →
            </Link>
          )}
        </div>
      </article>
    </div>
  );
}
