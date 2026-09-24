import { userProxies } from "@pluck/db";
import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { AdminsOnly } from "@/components/dashboard/admins-only";
import { AddProxyForm, ProxyRowActions } from "@/components/dashboard/proxy-forms";
import { db } from "@/lib/db";
import { can, requireWorkspace } from "@/lib/workspace";

export const metadata = { title: "Proxies" };
export const dynamic = "force-dynamic";

export default async function ProxiesPage() {
  const { workspace } = await requireWorkspace();
  const manage = can.manageCredentials(workspace.role);
  const rows = await db
    .select()
    .from(userProxies)
    .where(eq(userProxies.orgId, workspace.id))
    .orderBy(asc(userProxies.createdAt));

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-lg">Your proxies</h2>
        <p className="mt-1 text-sm text-[var(--ink-soft)]">
          Requests you send go out through these instead of our shared pool, so a provider you
          already pay for does the egress and the sites you scrape see your addresses. Set{" "}
          <code className="mono text-[var(--ink)]">proxy</code> on a request to{" "}
          <code className="mono text-[var(--ink)]">datacenter</code>,{" "}
          <code className="mono text-[var(--ink)]">residential</code> or{" "}
          <code className="mono text-[var(--ink)]">auto</code>: auto tries direct first and only
          escalates when a site blocks it.
        </p>

        {rows.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--ink-soft)]">
            None yet. Requests use this instance's proxies, or go out directly.
          </p>
        ) : (
          <div className="sheet mt-4 overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <thead className="text-left text-xs text-[var(--ink-faint)]">
                <tr>
                  {["Name", "Tier", "Gateway", "State", ""].map((h) => (
                    <th key={h} className="border-b border-[var(--line)] px-3 py-2 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const retired = row.failures >= 5;
                  return (
                    <tr key={row.id} className="border-b border-[var(--line)] last:border-0">
                      <td className="px-3 py-2">{row.label}</td>
                      <td className="px-3 py-2 text-[var(--ink-soft)]">{row.tier}</td>
                      <td className="mono px-3 py-2 text-xs text-[var(--ink-faint)]">
                        {row.urlHint}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {!row.active ? (
                          <span className="text-[var(--ink-faint)]">paused</span>
                        ) : retired ? (
                          <span className="text-[var(--accent)]">
                            failing ({row.failures} in a row)
                          </span>
                        ) : (
                          <span className="text-[var(--leaf)]">in rotation</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {manage && <ProxyRowActions id={row.id} active={row.active} />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg">Add a proxy</h2>
        <p className="mt-1 text-sm text-[var(--ink-soft)]">
          The URL is encrypted before it is stored and never shown again; only the gateway host
          stays visible. A proxy that fails five checks in a row drops out of rotation until you
          enable it again.
        </p>
        <div className="mt-4">
          {manage ? <AddProxyForm /> : <AdminsOnly what="add or change proxies" />}
        </div>
        <p className="mt-4 text-sm text-[var(--ink-soft)]">
          Running Pluck yourself?{" "}
          <Link
            href="/docs/self-hosting"
            className="text-[var(--accent)] underline underline-offset-4"
          >
            PROXY_DATACENTER_URLS and PROXY_RESIDENTIAL_URLS
          </Link>{" "}
          set them for the whole instance instead.
        </p>
      </section>
    </div>
  );
}
