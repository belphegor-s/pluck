import { llmCredentials } from "@pluck/db";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { CodeBlock } from "@/components/code-tabs";
import { ProviderForm } from "@/components/dashboard/forms";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata = { title: "Model provider" };
export const dynamic = "force-dynamic";

export default async function AiPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const saved = await db
    .select({
      provider: llmCredentials.provider,
      keyHint: llmCredentials.keyHint,
      model: llmCredentials.model,
      isDefault: llmCredentials.isDefault,
    })
    .from(llmCredentials)
    .where(eq(llmCredentials.userId, session!.user.id));

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-lg">Bring your own model</h2>
        <p className="mt-1 max-w-[65ch] text-sm text-[var(--ink-soft)]">
          Extraction, product parsing and industry classification need a language model. Add your
          own provider key and those calls bill to your provider account — Pluck charges 1 credit
          instead of 8. Keys are encrypted with AES-256-GCM and are never returned by the API.
        </p>
      </section>
      <ProviderForm saved={saved} />
      <section>
        <h2 className="text-lg">Per-request override</h2>
        <p className="mt-1 max-w-[65ch] text-sm text-[var(--ink-soft)]">
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
