import { Search } from "lucide-react";

/** A plain GET form: the query lives in the URL, so results are linkable. */
export function SearchBox({ placeholder, value }: { placeholder: string; value: string }) {
  return (
    <form className="relative w-full sm:w-96">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--ink-faint)]" />
      <input
        name="q"
        defaultValue={value}
        placeholder={placeholder}
        className="w-full border border-[var(--line)] bg-[var(--sheet)] py-2.5 pl-9 pr-3 outline-none transition-colors focus:border-[var(--accent)]"
      />
    </form>
  );
}

export function Pager({
  page,
  hasMore,
  base,
  params = {},
}: {
  page: number;
  hasMore: boolean;
  base: string;
  params?: Record<string, string>;
}) {
  if (page === 1 && !hasMore) return null;
  const kept = Object.fromEntries(Object.entries(params).filter(([, v]) => v));
  const href = (p: number) => `${base}?${new URLSearchParams({ ...kept, page: String(p) })}`;
  const cls = "border border-[var(--line)] px-3 py-1.5 text-sm hover:border-[var(--ink-faint)]";
  return (
    <div className="mt-4 flex items-center justify-between">
      {page > 1 ? (
        <a href={href(page - 1)} className={cls}>
          Newer
        </a>
      ) : (
        <span />
      )}
      <span className="mono text-xs text-[var(--ink-faint)]">Page {page}</span>
      {hasMore ? (
        <a href={href(page + 1)} className={cls}>
          Older
        </a>
      ) : (
        <span />
      )}
    </div>
  );
}
