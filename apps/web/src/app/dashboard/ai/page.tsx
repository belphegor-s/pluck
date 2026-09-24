import { llmCredentials } from "@pluck/db";
import { eq } from "drizzle-orm";
import { CodeBlock } from "@/components/code-tabs";
import { AdminsOnly } from "@/components/dashboard/admins-only";
import { ProviderForm } from "@/components/dashboard/forms";
import { db } from "@/lib/db";
import { can, requireWorkspace } from "@/lib/workspace";

export const metadata = { title: "Model provider" };
export const dynamic = "force-dynamic";

export default async function AiPage() {
  const { workspace } = await requireWorkspace();
  const saved = await db
    .select({
      provider: llmCredentials.provider,
      keyHint: llmCredentials.keyHint,
      model: llmCredentials.model,
      isDefault: llmCredentials.isDefault,
    })
    .from(llmCredentials)
    .where(eq(llmCredentials.orgId, workspace.id));

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-lg">Bring your own model</h2>
        <p className="mt-1 text-sm text-[var(--ink-soft)]">
          Extraction, product parsing and industry classification need a language model. Add your
          own provider key and those calls bill to your provider account — Pluck charges 1 credit
          instead of 8. Keys are encrypted with AES-256-GCM and are never returned by the API.
        </p>
      </section>
      {can.manageCredentials(workspace.role) ? (
        <ProviderForm saved={saved} />
      ) : (
        <div className="space-y-3">
          <AdminsOnly what="change model provider keys" />
          {saved.length > 0 && (
            <p className="text-sm text-[var(--ink-soft)]">
              In use:{" "}
              {saved.map((row) => `${row.provider}${row.isDefault ? " (default)" : ""}`).join(", ")}
              .
            </p>
          )}
        </div>
      )}
      <section>
        <h2 className="text-lg">Per-request override</h2>
        <p className="mt-1 text-sm text-[var(--ink-soft)]">
          You can also send a key with a single request; nothing is stored in that case.
        </p>
        <CodeBlock
          className="mt-3"
          language="bash"
          code={`-H "x-llm-provider: anthropic"
-H "x-llm-key: sk-ant-…"
-H "x-llm-model: claude-haiku-4-5"`}
        />
      </section>
    </div>
  );
}
