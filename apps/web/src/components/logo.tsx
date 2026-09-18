import { SITE } from "@/lib/site";

/**
 * The mark: a stem with one berry being lifted off it — a pluck.
 * Stroke inherits text color so it works on paper and in the dark.
 */
export function Logo({ size = 22, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M4 21c0-7.2 4.4-12.4 11-14"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <circle cx="17.4" cy="5.6" r="3.4" fill="var(--accent)" />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <Logo />
      <span className="font-[family-name:var(--font-display)] text-lg font-semibold lowercase tracking-[-0.03em]">
        {SITE.name}
      </span>
    </span>
  );
}
