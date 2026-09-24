/** Shown in place of a control the member's role does not allow. */
export function AdminsOnly({ what }: { what: string }) {
  return (
    <p className="sheet p-4 text-sm text-[var(--ink-soft)]">
      Only owners and admins can {what} in this workspace. Ask one of them if something needs
      changing.
    </p>
  );
}
