"use client";

import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import {
  type AdminState,
  restartSignInAction,
  signInAction,
  verifyAction,
} from "@/lib/admin/actions";

const empty: AdminState = {};

const field =
  "mt-1.5 w-full border border-[var(--line)] bg-[var(--paper)] px-3 py-2.5 outline-none transition-colors focus:border-[var(--accent)]";

function Alert({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="mt-4 border-l-2 border-[var(--accent)] pl-3 text-sm text-[var(--accent)]"
    >
      {message}
    </p>
  );
}

function Submit({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-6 flex w-full cursor-pointer items-center justify-center gap-2 bg-[var(--ink)] px-4 py-3 font-medium text-[var(--paper)] transition-opacity disabled:cursor-wait disabled:opacity-70"
    >
      {pending && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

export function CredentialsForm() {
  const [state, action, pending] = useActionState(signInAction, empty);
  const [show, setShow] = useState(false);
  // Controlled, so a failed attempt (React resets forms after an action) keeps it.
  const [username, setUsername] = useState("");

  return (
    <form action={action} className="mt-6">
      <label className="block">
        <span className="text-sm text-[var(--ink-soft)]">Username</span>
        <input
          name="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          className={field}
        />
      </label>
      <label className="mt-4 block">
        <span className="text-sm text-[var(--ink-soft)]">Password</span>
        <span className="relative block">
          <input
            name="password"
            type={show ? "text" : "password"}
            required
            autoComplete="current-password"
            className={`${field} pr-11`}
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? "Hide password" : "Show password"}
            className="absolute right-1 top-1/2 mt-[3px] flex size-9 -translate-y-1/2 cursor-pointer items-center justify-center text-[var(--ink-faint)] hover:text-[var(--ink)]"
          >
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </span>
      </label>
      <Alert message={state.error} />
      <Submit pending={pending}>{pending ? "Checking…" : "Continue"}</Submit>
    </form>
  );
}

/** Six boxes that behave like one field: typing advances, paste fills, backspace goes back. */
export function CodeForm({ submitLabel }: { submitLabel: string }) {
  const [state, action, pending] = useActionState(verifyAction, empty);
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const boxes = useRef<(HTMLInputElement | null)[]>([]);
  const form = useRef<HTMLFormElement | null>(null);
  const code = digits.join("");

  // The first box takes focus on arrival, so a code can be typed straight away.
  useEffect(() => boxes.current[0]?.focus(), []);

  const fill = (start: number, value: string) => {
    const incoming = value
      .replace(/\D/g, "")
      .slice(0, 6 - start)
      .split("");
    if (incoming.length === 0) return;
    const next = [...digits];
    incoming.forEach((d, i) => {
      next[start + i] = d;
    });
    setDigits(next);
    const last = Math.min(start + incoming.length, 5);
    boxes.current[last]?.focus();
    // A full code submits itself: one less tap on a phone.
    if (next.every(Boolean)) requestAnimationFrame(() => form.current?.requestSubmit());
  };

  return (
    <>
      <form ref={form} action={action} className="mt-6">
        <input type="hidden" name="code" value={code} />
        <fieldset disabled={pending}>
          <legend className="sr-only">Six-digit code</legend>
          <div className="grid grid-cols-6 gap-2 sm:gap-3">
            {digits.map((d, i) => (
              <input
                key={i}
                ref={(el) => {
                  boxes.current[i] = el;
                }}
                value={d}
                inputMode="numeric"
                autoComplete={i === 0 ? "one-time-code" : "off"}
                aria-label={`Digit ${i + 1}`}
                maxLength={6}
                onChange={(e) => {
                  if (e.target.value === "") {
                    const next = [...digits];
                    next[i] = "";
                    setDigits(next);
                  } else fill(i, e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Backspace" && !digits[i] && i > 0) boxes.current[i - 1]?.focus();
                  if (e.key === "ArrowLeft" && i > 0) boxes.current[i - 1]?.focus();
                  if (e.key === "ArrowRight" && i < 5) boxes.current[i + 1]?.focus();
                }}
                onPaste={(e) => {
                  e.preventDefault();
                  fill(i, e.clipboardData.getData("text"));
                }}
                onFocus={(e) => e.target.select()}
                className="mono aspect-square w-full border border-[var(--line)] bg-[var(--paper)] text-center text-2xl outline-none transition-colors focus:border-[var(--accent)] sm:text-3xl"
              />
            ))}
          </div>
        </fieldset>
        <Alert message={state.error} />
        <Submit pending={pending}>{pending ? "Verifying…" : submitLabel}</Submit>
      </form>
      <form action={restartSignInAction} className="mt-3 text-center">
        <button
          type="submit"
          className="cursor-pointer text-sm text-[var(--ink-soft)] underline decoration-dotted underline-offset-4 hover:text-[var(--ink)]"
        >
          Start again
        </button>
      </form>
    </>
  );
}
