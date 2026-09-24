import { CreateWorkspaceForm } from "@/components/dashboard/team-forms";

export const metadata = { title: "New workspace" };

export default function NewWorkspacePage() {
  return (
    <div className="space-y-4">
      <h2 className="text-lg">Create a workspace</h2>
      <p className="text-sm text-[var(--ink-soft)]">
        A workspace has its own API keys, credits, monitors, webhooks and model keys, shared by the
        people you invite. You will be its owner, and credits are bought per workspace.
      </p>
      <CreateWorkspaceForm />
    </div>
  );
}
