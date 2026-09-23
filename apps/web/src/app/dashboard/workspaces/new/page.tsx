import { CreateWorkspaceForm } from "@/components/dashboard/team-forms";

export const metadata = { title: "New workspace" };

export default function NewWorkspacePage() {
  return (
    <div className="max-w-2xl space-y-4">
      <h2 className="text-lg">Create a team workspace</h2>
      <p className="text-sm text-[var(--ink-soft)]">
        A workspace has its own API keys, credits, monitors, webhooks and model keys, shared by the
        people you invite. You will be its owner. Credits are bought per workspace, and your
        personal workspace stays as it is.
      </p>
      <CreateWorkspaceForm />
    </div>
  );
}
