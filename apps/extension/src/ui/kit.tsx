import { type ReactNode, useEffect, useRef, useState } from "react";
import type { Theme } from "../lib/types";

/** The mark: a stem with one berry being lifted off it. Same drawing as the site. */
export function Logo({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
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

const ICONS = {
  back: "M10 3 5 8l5 5M5 8h8",
  gear: "M8 10.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4ZM8 1.5v1.7M8 12.8v1.7M1.5 8h1.7M12.8 8h1.7M3.4 3.4l1.2 1.2M11.4 11.4l1.2 1.2M12.6 3.4l-1.2 1.2M4.6 11.4l-1.2 1.2",
  copy: "M5.5 5.5h7v8h-7zM3.5 10.5v-8h7",
  check: "m3 8.5 3.2 3.2L13 4.8",
  download: "M8 2.5v8M4.8 7.5 8 10.7l3.2-3.2M3 13.5h10",
  external: "M9 3h4v4M13 3 7.5 8.5M11 9.5v3.5H3V5h3.5",
  close: "m4 4 8 8M12 4l-8 8",
  refresh: "M13 8a5 5 0 1 1-1.6-3.7M13 2.5v2.5h-2.5",
} as const;

export function Icon({ name, size = 16 }: { name: keyof typeof ICONS; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={ICONS[name]} />
    </svg>
  );
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "solid" | "accent" | "outline" | "ghost";
  small?: boolean;
  block?: boolean;
  /** Shows the lifting berry and disables the button. */
  busy?: boolean;
};

export function Button({
  variant = "outline",
  small,
  block,
  busy,
  className = "",
  children,
  disabled,
  ...rest
}: ButtonProps) {
  const classes = [
    "btn",
    `btn--${variant}`,
    small && "btn--small",
    block && "btn--block",
    className,
  ];
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || busy}
      className={classes.filter(Boolean).join(" ")}
    >
      {busy && <span className="berry" aria-hidden="true" />}
      {children}
    </button>
  );
}

export function IconButton({
  label,
  icon,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  icon: keyof typeof ICONS;
}) {
  return (
    <button type="button" {...rest} className="icon-btn" aria-label={label} title={label}>
      <Icon name={icon} />
    </button>
  );
}

/** A link that leaves the extension; always a new tab. */
export function Out({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={className}>
      {children}
    </a>
  );
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Says "Copied" for a moment after `copy` resolves true. */
export function useCopied(): [boolean, (copy: () => Promise<boolean>) => void] {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return [
    copied,
    (copy) => {
      void copy().then((ok) => {
        if (!ok) return;
        setCopied(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 1600);
      });
    },
  ];
}

export function CopyButton({
  text,
  label = "Copy",
  variant = "outline",
  small = true,
}: {
  text: string | (() => string);
  label?: string;
  variant?: ButtonProps["variant"];
  small?: boolean;
}) {
  const [copied, run] = useCopied();
  return (
    <Button
      variant={variant}
      small={small}
      onClick={() => run(() => copyText(typeof text === "function" ? text() : text))}
    >
      <Icon name={copied ? "check" : "copy"} size={14} />
      <span aria-live="polite">{copied ? "Copied" : label}</span>
    </Button>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control arrives as children
    <label className="field">
      <span className="field-name">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Segmented<T extends string>({
  name,
  value,
  options,
  onChange,
  label,
}: {
  name: string;
  value: T;
  options: readonly { value: T; label: string; disabled?: boolean }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <label key={option.value}>
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={option.value === value}
            disabled={option.disabled}
            onChange={() => onChange(option.value)}
          />
          {option.label}
        </label>
      ))}
    </div>
  );
}

export function Check({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  );
}

export function Note({
  tone,
  title,
  children,
}: {
  tone?: "error" | "warn" | "good";
  title?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={`note${tone ? ` note--${tone}` : ""}`}
      role={tone === "error" ? "alert" : "status"}
    >
      {title && <strong>{title}</strong>}
      {children}
    </div>
  );
}

/** Applies the chosen theme; `auto` leaves it to the system. */
export function applyTheme(theme: Theme): void {
  if (theme === "auto") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}
