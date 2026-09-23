import { CopyButton } from "@/components/copy-button";
import { DeleteAccount } from "@/components/dashboard/delete-account";
import {
  DeleteWorkspace,
  LeaveWorkspace,
  RenameWorkspaceForm,
} from "@/components/dashboard/team-forms";
import { can, requireWorkspace, roleLabel } from "@/lib/workspace";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { user, workspace, workspaces } = await requireWorkspace("/dashboard/settings");
  const personal = workspaces.find((w) => w.personal);
  const role = roleLabel[workspace.role].toLowerCase();

  return (
    <div className="space-y-12">
      <section className="space-y-5">
        <div>
          <h2 className="text-lg">Workspace</h2>
          <p className="mt-1 max-w-[65ch] text-sm text-[var(--ink-soft)]">
            {workspace.personal
              ? "Your personal workspace. Its keys, credits and monitors are yours alone."
              : `Keys, credits, monitors and webhooks here are shared by everyone in ${workspace.name}. You are ${role === "member" ? "a" : "an"} ${role}.`}
          </p>
        </div>

        <dl className="grid max-w-2xl gap-3 text-sm sm:grid-cols-2">
          <div className="sheet p-3">
            <dt className="text-xs text-[var(--ink-faint)]">Workspace id</dt>
            <dd className="mt-1 flex items-center gap-2">
              <code className="mono min-w-0 flex-1 truncate text-xs">{workspace.id}</code>
              <CopyButton text={workspace.id} />
            </dd>
          </div>
          <div className="sheet p-3">
            <dt className="text-xs text-[var(--ink-faint)]">Your role</dt>
            <dd className="mt-1">{roleLabel[workspace.role]}</dd>
          </div>
        </dl>

        {!workspace.personal && can.manageSettings(workspace.role) && (
          <RenameWorkspaceForm name={workspace.name} />
        )}
      </section>

      {!workspace.personal && (
        <section className="space-y-4 border-t border-[var(--line)] pt-6">
          <div>
            <h2 className="text-lg">Leave or delete</h2>
            <p className="mt-1 max-w-[65ch] text-sm text-[var(--ink-soft)]">
              Leaving removes your access and revokes the keys you created here. The workspace needs
              at least one owner, so the last owner hands it over or deletes it.
            </p>
          </div>
          <LeaveWorkspace name={workspace.name} />
          {can.deleteWorkspace(workspace.role) && (
            <DeleteWorkspace name={workspace.name} credits={workspace.credits} />
          )}
        </section>
      )}

      <section className="space-y-4 border-t border-[var(--line)] pt-6">
        <div>
          <h2 className="text-lg">Your account</h2>
          <p className="mt-1 max-w-[65ch] text-sm text-[var(--ink-soft)]">
            Signed in with GitHub as <span className="text-[var(--ink)]">{user.email}</span>.
            Deleting your account removes your personal workspace and any team you are the only
            member of. Teams with other people carry on without you.
          </p>
        </div>
        <DeleteAccount email={user.email} credits={personal?.credits ?? 0} />
      </section>
    </div>
  );
}
