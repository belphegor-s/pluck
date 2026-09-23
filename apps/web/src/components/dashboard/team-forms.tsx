"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { SelectMenu } from "@/components/select-menu";
import {
  changeRole,
  createWorkspace,
  deleteWorkspace,
  inviteMember,
  leaveWorkspace,
  removeMember,
  renameWorkspace,
  revokeInvitation,
  type TeamState,
} from "@/lib/team-actions";

const empty: TeamState = {};

const input =
  "mt-1 w-full border border-[var(--line)] bg-[var(--sheet)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]";
const primary =
  "bg-[var(--ink)] px-4 py-2.5 text-sm text-[var(--paper)] disabled:opacity-60 sm:py-2";

function Notice({ state }: { state: TeamState }) {
  if (!state.ok && !state.error) return null;
  return (
    <p
      className={`text-sm ${state.error ? "text-[var(--accent)]" : "text-[var(--leaf)]"}`}
      role="status"
    >
      {state.error ?? state.ok}
    </p>
  );
}

const ROLE_OPTIONS = [
  { value: "member" as const, label: "Member", hint: "Uses keys, monitors and the playground" },
  { value: "admin" as const, label: "Admin", hint: "Also people, billing and credentials" },
];

export function InviteForm() {
  const [state, action, pending] = useActionState(inviteMember, empty);
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_auto] sm:items-end">
        <label className="block text-sm">
          <span className="block text-[var(--ink-soft)]">Email</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="off"
            placeholder="teammate@company.com"
            className={input}
          />
        </label>
        <div className="text-sm">
          <span className="block text-[var(--ink-soft)]">Role</span>
          <SelectMenu name="role" label="Role" defaultValue="member" options={ROLE_OPTIONS} />
        </div>
        <button type="submit" disabled={pending} className={primary}>
          {pending ? "Inviting…" : "Send invite"}
        </button>
      </div>
      <Notice state={state} />
      {state.link && (
        <div className="flex items-center gap-2 border border-[var(--line)] bg-[var(--paper)] px-3 py-2">
          <code className="mono min-w-0 flex-1 truncate text-xs">{state.link}</code>
          <CopyButton text={state.link} label="Copy link" />
        </div>
      )}
    </form>
  );
}

export function RevokeInvitation({ id }: { id: string }) {
  const [state, action, pending] = useActionState(revokeInvitation, empty);
  return (
    <form action={action} className="flex items-center justify-end gap-2">
      <input type="hidden" name="id" value={id} />
      {state.error && <span className="text-xs text-[var(--accent)]">{state.error}</span>}
      <button
        type="submit"
        disabled={pending}
        className="text-xs text-[var(--ink-faint)] underline underline-offset-4 hover:text-[var(--accent)] disabled:opacity-60"
      >
        Revoke
      </button>
    </form>
  );
}

export function MemberControls({
  id,
  role,
  canEditOwner,
  isSelf,
}: {
  id: string;
  role: "owner" | "admin" | "member";
  /** Only owners may make, change or remove owners. */
  canEditOwner: boolean;
  isSelf: boolean;
}) {
  const [roleState, setRoleAction, settingRole] = useActionState(changeRole, empty);
  const [removeState, removeAction, removing] = useActionState(removeMember, empty);
  const locked = role === "owner" && !canEditOwner;
  const options = canEditOwner
    ? [
        ...ROLE_OPTIONS,
        {
          value: "owner" as const,
          label: "Owner",
          hint: "Everything, including deleting the workspace",
        },
      ]
    : ROLE_OPTIONS;
  const error = roleState.error ?? removeState.error;
  // A refused change must not leave the picker showing a role the server
  // kept: remount it from the real role whenever a change is rejected.
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (roleState.error) setAttempt((n) => n + 1);
  }, [roleState]);

  if (locked) return <span className="text-xs text-[var(--ink-faint)]">Owner</span>;

  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      <div className="w-36">
        <SelectMenu
          key={`${role}-${attempt}`}
          name="role"
          label="Role"
          defaultValue={role}
          options={options}
          // Saved on pick, like any settings toggle; the server re-checks the rules.
          onChange={(next) => {
            const data = new FormData();
            data.set("id", id);
            data.set("role", next);
            startTransition(() => setRoleAction(data));
          }}
        />
      </div>
      {!isSelf && (
        <form
          action={removeAction}
          onSubmit={(event) => {
            if (!confirm("Remove this person? Keys they created stop working."))
              event.preventDefault();
          }}
        >
          <input type="hidden" name="id" value={id} />
          <button
            type="submit"
            disabled={removing}
            className="text-xs text-[var(--ink-faint)] underline underline-offset-4 hover:text-[var(--accent)] disabled:opacity-60"
          >
            Remove
          </button>
        </form>
      )}
      {(settingRole || error) && (
        <span
          className={`w-full text-right text-xs ${error ? "text-[var(--accent)]" : "text-[var(--ink-faint)]"}`}
        >
          {error ?? "Saving…"}
        </span>
      )}
    </div>
  );
}

export function CreateWorkspaceForm() {
  const [state, action, pending] = useActionState(createWorkspace, empty);
  return (
    <form action={action} className="max-w-md space-y-3">
      <label className="block text-sm">
        <span className="block text-[var(--ink-soft)]">Name</span>
        <input
          name="name"
          required
          minLength={2}
          maxLength={60}
          placeholder="Acme research"
          className={input}
        />
      </label>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button type="submit" disabled={pending} className={primary}>
          {pending ? "Creating…" : "Create workspace"}
        </button>
        <Notice state={state} />
      </div>
    </form>
  );
}

export function RenameWorkspaceForm({ name }: { name: string }) {
  const [state, action, pending] = useActionState(renameWorkspace, empty);
  return (
    <form action={action} className="max-w-md space-y-3">
      <label className="block text-sm">
        <span className="block text-[var(--ink-soft)]">Name</span>
        <input
          name="name"
          required
          minLength={2}
          maxLength={60}
          defaultValue={name}
          className={input}
        />
      </label>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button type="submit" disabled={pending} className={primary}>
          {pending ? "Saving…" : "Save"}
        </button>
        <Notice state={state} />
      </div>
    </form>
  );
}

export function LeaveWorkspace({ name }: { name: string }) {
  const [state, action, pending] = useActionState(leaveWorkspace, empty);
  return (
    <form
      action={action}
      className="space-y-2"
      onSubmit={(event) => {
        if (!confirm(`Leave ${name}? Keys you created in it stop working.`)) event.preventDefault();
      }}
    >
      <button
        type="submit"
        disabled={pending}
        className="border border-[var(--line)] px-4 py-2 text-sm text-[var(--accent)] transition-colors hover:border-[var(--accent)] disabled:opacity-60"
      >
        {pending ? "Leaving…" : "Leave workspace"}
      </button>
      <Notice state={state} />
    </form>
  );
}

export function DeleteWorkspace({ name, credits }: { name: string; credits: number }) {
  const [state, action, pending] = useActionState(deleteWorkspace, empty);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");

  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="border border-[var(--line)] px-4 py-2 text-sm text-[var(--accent)] transition-colors hover:border-[var(--accent)]"
      >
        Delete workspace…
      </button>
    );

  return (
    <form action={action} className="sheet max-w-xl space-y-4 border-[var(--accent)] p-4">
      <p className="text-sm text-[var(--ink-soft)]">
        Deletes {name} for everyone: its keys stop working, monitors stop, and its usage history,
        crawls and webhook log are removed.
        {credits > 0 && (
          <>
            {" "}
            Its <span className="mono text-[var(--ink)]">{credits.toLocaleString()}</span> remaining
            credits are forfeited.
          </>
        )}{" "}
        This cannot be undone.
      </p>
      <label className="block text-sm">
        <span className="block text-[var(--ink-soft)]">
          Type <span className="mono text-[var(--ink)]">{name}</span> to confirm
        </span>
        <input
          name="confirm"
          autoComplete="off"
          spellCheck={false}
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          className={`mono ${input}`}
        />
      </label>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          type="submit"
          disabled={typed.trim() !== name || pending}
          className="bg-[var(--accent)] px-4 py-2.5 text-sm text-white disabled:opacity-50 sm:py-2"
        >
          {pending ? "Deleting…" : "Delete workspace"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setTyped("");
          }}
          className="text-sm text-[var(--ink-soft)] underline underline-offset-4 hover:text-[var(--ink)]"
        >
          Cancel
        </button>
        <Notice state={state} />
      </div>
    </form>
  );
}
