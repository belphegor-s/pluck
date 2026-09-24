import { CopyButton } from "@/components/copy-button";
import { AvatarEditor } from "@/components/dashboard/avatar-editor";
import {
  DeleteWorkspace,
  LeaveWorkspace,
  RenameWorkspaceForm,
} from "@/components/dashboard/team-forms";
import { removeWorkspaceAvatar, uploadWorkspaceAvatar } from "@/lib/team-actions";
import { can, requireWorkspace, roleLabel } from "@/lib/workspace";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { workspace } = await requireWorkspace("/dashboard/settings");
  const role = roleLabel[workspace.role].toLowerCase();
  const manage = can.manageSettings(workspace.role);

  return (
    <div className="space-y-12">
      <section className="space-y-6">
        <div>
          <h2 className="text-lg">Workspace</h2>
          <p className="mt-1 text-sm text-[var(--ink-soft)]">
            Keys, credits, monitors and webhooks here are shared by everyone in {workspace.name}.
            You are {role === "member" ? "a" : "an"} {role}
            {manage ? "." : ", so the name and picture are set by owners and admins."}
          </p>
        </div>

        <AvatarEditor
          name={workspace.name}
          image={workspace.image}
          custom={workspace.image !== null}
          upload={uploadWorkspaceAvatar}
          remove={removeWorkspaceAvatar}
          shape="square"
          disabled={!manage}
        />
        {manage && <RenameWorkspaceForm name={workspace.name} />}

        <dl className="grid gap-3 text-sm sm:grid-cols-2">
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
      </section>

      <section className="space-y-4 border border-[color-mix(in_srgb,var(--accent)_45%,var(--line))] p-5">
        <div>
          <h2 className="text-lg text-[var(--accent)]">Danger zone</h2>
          <p className="mt-1 text-sm text-[var(--ink-soft)]">
            Leaving removes your access and revokes the keys you created here. A workspace needs at
            least one owner, so the last owner hands it over or deletes it.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <LeaveWorkspace name={workspace.name} />
          {can.deleteWorkspace(workspace.role) && (
            <DeleteWorkspace name={workspace.name} credits={workspace.credits} />
          )}
        </div>
      </section>
    </div>
  );
}
