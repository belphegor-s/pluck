import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
      <h1 className="text-4xl">Nothing to pluck here</h1>
      <p className="mt-4 text-[var(--ink-soft)]">
        That page does not exist. The docs are the best place to start, or try the playground.
      </p>
      <div className="mt-8 flex gap-3">
        <Link href="/docs" className="bg-[var(--ink)] px-5 py-2.5 text-[var(--paper)]">
          Read the docs
        </Link>
        <Link
          href="/"
          className="border border-[var(--line)] px-5 py-2.5 transition-colors hover:border-[var(--ink)]"
        >
          Back home
        </Link>
      </div>
    </div>
  );
}
