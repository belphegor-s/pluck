import { organizations, webhookDeliveries } from "@pluck/db";
import { BRAND } from "@pluck/shared";
import { desc, eq } from "drizzle-orm";
import { CodeTabs } from "@/components/code-tabs";
import {
  RedeliverButton,
  SigningSecret,
  TestWebhookForm,
} from "@/components/dashboard/webhook-forms";
import { db } from "@/lib/db";
import { timeAgo } from "@/lib/format";
import { SITE } from "@/lib/site";
import { can, requireWorkspace } from "@/lib/workspace";

export const metadata = { title: "Webhooks" };
export const dynamic = "force-dynamic";

const STATUS = {
  succeeded: "text-[var(--leaf)]",
  failed: "text-[var(--accent)]",
  pending: "text-[var(--ink-soft)]",
} as const;

const SIGNATURE = BRAND.header("signature");

export default async function WebhooksPage() {
  const { workspace } = await requireWorkspace();
  const orgId = workspace.id;
  const [[account], deliveries] = await Promise.all([
    db
      .select({ secret: organizations.webhookSecret })
      .from(organizations)
      .where(eq(organizations.id, orgId)),
    db
      .select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.orgId, orgId))
      .orderBy(desc(webhookDeliveries.createdAt))
      .limit(100),
  ]);

  const failed = deliveries.filter((d) => d.status === "failed").length;

  return (
    <div className="space-y-10">
      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-lg">Deliveries</h2>
          {deliveries.length > 0 && (
            <p className="text-sm text-[var(--ink-soft)]">
              Last {deliveries.length}
              {failed > 0 && <span className="text-[var(--accent)]"> · {failed} failed</span>}
            </p>
          )}
        </div>
        <p className="mt-1 text-sm text-[var(--ink-soft)]">
          Every webhook sent from this workspace (crawl progress and monitor changes) with what your
          endpoint answered. A failed delivery is tried eight times in all, over about 20 minutes,
          then stops; resend it once the receiver is fixed. Kept for 30 days.
        </p>

        {deliveries.length === 0 ? (
          <p className="sheet mt-4 p-6 text-sm text-[var(--ink-soft)]">
            Nothing sent yet. Send a test event below, or add a webhook to a monitor or crawl.
          </p>
        ) : (
          <div className="sheet mt-4 overflow-x-auto">
            <table className="w-full min-w-[46rem] text-sm">
              <thead className="text-left text-xs text-[var(--ink-faint)]">
                <tr>
                  {["Event", "Endpoint", "Sent", "Attempts", "Result", ""].map((h) => (
                    <th key={h} className="border-b border-[var(--line)] px-3 py-2 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {deliveries.map((d) => (
                  <tr key={d.id} className="border-b border-[var(--line)] align-top last:border-0">
                    <td className="mono px-3 py-2.5 text-xs">{d.event}</td>
                    <td className="max-w-[28rem] px-3 py-2.5">
                      <span className="mono block truncate text-xs text-[var(--ink-soft)]">
                        {d.url.replace(/^https?:\/\//, "")}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-[var(--ink-faint)]">
                      {timeAgo(d.createdAt)}
                    </td>
                    <td className="mono px-3 py-2.5 text-xs">{d.attempts}</td>
                    <td className="max-w-[28rem] px-3 py-2.5 text-xs">
                      <span className={STATUS[d.status]}>
                        {d.status === "succeeded"
                          ? `${d.lastStatus} · ${d.lastDurationMs} ms`
                          : d.status === "failed"
                            ? "failed"
                            : d.attempts > 0
                              ? "retrying"
                              : "queued"}
                      </span>
                      {d.lastError && d.status !== "succeeded" && (
                        <span
                          className="block truncate text-[var(--ink-faint)]"
                          title={d.lastError}
                        >
                          {d.lastError}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {d.status !== "pending" && <RedeliverButton id={d.id} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg">Test an endpoint</h2>
        <p className="mt-1 text-sm text-[var(--ink-soft)]">
          Sends a signed <code className="mono">webhook.test</code> event, so you can check a
          receiver and its signature check before a real event depends on it.
        </p>
        <div className="mt-4">
          <TestWebhookForm />
        </div>
      </section>

      <section>
        <h2 className="text-lg">Signing secret</h2>
        <p className="mt-1 text-sm text-[var(--ink-soft)]">
          Every delivery carries a <code className="mono">{SIGNATURE}</code> header:{" "}
          <code className="mono">t=&lt;timestamp&gt;,v1=&lt;hmac&gt;</code>, an HMAC-SHA256 of{" "}
          <code className="mono">timestamp.body</code> with this secret. Reject anything that does
          not match, or is more than five minutes old.
        </p>
        <div className="mt-4">
          <SigningSecret
            secret={account?.secret ?? ""}
            canRotate={can.manageCredentials(workspace.role)}
          />
        </div>
        <div className="mt-6">
          <CodeTabs
            samples={[
              {
                label: "Node",
                language: "ts",
                code: `import { verifyWebhook } from "${SITE.sdkPackage}";

app.post("/hooks/pluck", express.text({ type: "*/*" }), async (req, res) => {
  const ok = await verifyWebhook(
    req.body,                                  // the raw body, not parsed JSON
    req.header("${SIGNATURE}"),
    process.env.PLUCK_WEBHOOK_SECRET,
  );
  if (!ok) return res.sendStatus(401);

  const { id, event, data } = JSON.parse(req.body);
  // \`id\` is stable across retries: use it to ignore duplicates.
  res.sendStatus(200);
});`,
              },
              {
                label: "Python",
                language: "python",
                code: `import os

from flask import request
from ${SITE.pythonPackage} import WebhookVerificationError, construct_event

@app.post("/hooks/pluck")
def hook():
    try:
        event = construct_event(
            request.get_data(),                # the raw body, not parsed JSON
            request.headers.get("${SIGNATURE}"),
            os.environ["PLUCK_WEBHOOK_SECRET"],
        )
    except WebhookVerificationError:
        return "", 401

    # event.id is stable across retries: use it to ignore duplicates.
    return "", 200`,
              },
            ]}
          />
        </div>
      </section>
    </div>
  );
}
