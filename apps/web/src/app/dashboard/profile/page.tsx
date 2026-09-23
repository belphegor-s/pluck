import { AvatarEditor } from "@/components/dashboard/avatar-editor";
import { DeleteAccount } from "@/components/dashboard/delete-account";
import { NameForm } from "@/components/dashboard/profile-forms";
import { requireWorkspace } from "@/lib/workspace";

export const metadata = { title: "Profile" };
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const { user, workspaces } = await requireWorkspace("/dashboard/profile");
  const personal = workspaces.find((w) => w.personal);

  return (
    <div className="space-y-12">
      <section className="space-y-6">
        <div>
          <h2 className="text-lg">Profile</h2>
          <p className="mt-1 max-w-[65ch] text-sm text-[var(--ink-soft)]">
            How you appear to the people you work with. Your email comes from GitHub and changes
            there.
          </p>
        </div>
        <AvatarEditor
          name={user.name || user.email}
          image={user.image}
          custom={user.image?.startsWith("/api/avatar/") ?? false}
        />
        <NameForm name={user.name} />
        <div className="max-w-md text-sm">
          <span className="block text-[var(--ink-soft)]">Email</span>
          <p className="mt-1 border border-[var(--line)] bg-[var(--paper)] px-3 py-2 text-[var(--ink-soft)]">
            {user.email}
          </p>
        </div>
      </section>

      <section className="space-y-4 border border-[color-mix(in_srgb,var(--accent)_45%,var(--line))] p-5">
        <div>
          <h2 className="text-lg text-[var(--accent)]">Danger zone</h2>
          <p className="mt-1 max-w-[65ch] text-sm text-[var(--ink-soft)]">
            Deleting your account removes your personal workspace and any team you are the only
            member of, straight away. Teams with other people carry on without you; if you are the
            only owner of one, hand it over first.
          </p>
        </div>
        <DeleteAccount email={user.email} credits={personal?.credits ?? 0} />
      </section>
    </div>
  );
}
