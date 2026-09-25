import "server-only";
import { BRAND } from "@pluck/shared";
import { db } from "@/lib/db";
import { SITE } from "@/lib/site";

export const RANGES = [7, 30, 90] as const;
export type Range = (typeof RANGES)[number];
export const parseRange = (v: string | undefined): Range =>
  (RANGES as readonly number[]).includes(Number(v)) ? (Number(v) as Range) : 30;

const sql = () => db.$client;
const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

export interface DayPoint {
  day: string;
  requests: number;
  errors: number;
  credits: number;
  signups: number;
  revenue: number;
  p50: number;
  p95: number;
}

/** Everything the overview needs, in parallel. Each query is bounded by the range. */
export async function overview(days: Range) {
  const q = sql();
  const since = q`now() - make_interval(days => ${days})`;

  const [kpis, series, endpoints, topWorkspaces, signups, purchases, failures, contacts, system] =
    await Promise.all([
      q`
        select
          (select count(*) from "user") as users,
          (select count(*) from "user" where created_at > ${since}) as users_new,
          (select count(*) from organization) as workspaces,
          (select count(*) from organization where created_at > ${since}) as workspaces_new,
          (select coalesce(sum(amount_usd_cents), 0) from credit_ledger
             where reason = 'purchase' and created_at > ${since}) as revenue_cents,
          (select coalesce(sum(amount_usd_cents), 0) from credit_ledger
             where reason = 'purchase') as revenue_all_cents,
          (select count(*) from credit_ledger where reason = 'purchase' and created_at > ${since}) as purchases,
          (select coalesce(sum(credits), 0) from organization) as credits_outstanding,
          (select count(*) from api_key where revoked_at is null) as keys_active,
          (select count(*) from monitor where active) as monitors_active,
          (select count(*) from crawl where status in ('queued', 'running')) as crawls_running,
          u.requests, u.errors, u.client_errors, u.credits, u.p50, u.p95, u.cached
        from (
          select count(*) as requests,
                 count(*) filter (where status >= 500) as errors,
                 count(*) filter (where status between 400 and 499) as client_errors,
                 coalesce(sum(credits), 0) as credits,
                 count(*) filter (where cached) as cached,
                 percentile_cont(0.5) within group (order by duration_ms) as p50,
                 percentile_cont(0.95) within group (order by duration_ms) as p95
          from usage_event where created_at > ${since}
        ) u`,
      q`
        with d as (
          select generate_series(date_trunc('day', now()) - make_interval(days => ${days - 1}),
                                 date_trunc('day', now()), interval '1 day') as day
        )
        select to_char(d.day, 'YYYY-MM-DD') as day,
               coalesce(u.requests, 0) as requests, coalesce(u.errors, 0) as errors,
               coalesce(u.credits, 0) as credits, coalesce(u.p50, 0) as p50, coalesce(u.p95, 0) as p95,
               coalesce(s.signups, 0) as signups, coalesce(r.revenue, 0) as revenue
        from d
        left join (
          select date_trunc('day', created_at) as day, count(*) as requests,
                 count(*) filter (where status >= 400) as errors, sum(credits) as credits,
                 percentile_cont(0.5) within group (order by duration_ms) as p50,
                 percentile_cont(0.95) within group (order by duration_ms) as p95
          from usage_event where created_at > ${since} group by 1
        ) u on u.day = d.day
        left join (
          select date_trunc('day', created_at) as day, count(*) as signups
          from "user" where created_at > ${since} group by 1
        ) s on s.day = d.day
        left join (
          select date_trunc('day', created_at) as day, sum(amount_usd_cents) / 100.0 as revenue
          from credit_ledger where reason = 'purchase' and created_at > ${since} group by 1
        ) r on r.day = d.day
        order by d.day`,
      q`
        select endpoint, count(*) as requests, coalesce(sum(credits), 0) as credits,
               round(avg(duration_ms)) as avg_ms,
               percentile_cont(0.95) within group (order by duration_ms) as p95,
               count(*) filter (where status >= 500) as errors
        from usage_event where created_at > ${since}
        group by endpoint order by requests desc limit 12`,
      q`
        select o.id, o.name, o.credits as balance, count(u.id) as requests,
               coalesce(sum(u.credits), 0) as used, max(u.created_at) as last_seen
        from organization o
        join usage_event u on u.org_id = o.id and u.created_at > ${since}
        group by o.id order by used desc, requests desc limit 8`,
      q`select id, name, email, image, created_at from "user" order by created_at desc limit 8`,
      q`
        select l.id, l.org_id, o.name as workspace, l.delta, l.amount_usd_cents, l.reason, l.created_at
        from credit_ledger l join organization o on o.id = l.org_id
        where l.reason in ('purchase', 'refund', 'adjustment')
        order by l.created_at desc limit 8`,
      q`
        select u.created_at, u.endpoint, u.status, u.target, u.duration_ms, o.name as workspace
        from usage_event u join organization o on o.id = u.org_id
        where u.status >= 500 and u.created_at > ${since}
        order by u.created_at desc limit 8`,
      q`select id, name, email, company, volume, message, created_at from contact_request order by created_at desc limit 5`,
      q`
        select pg_database_size(current_database()) as db_bytes,
               (select count(*) from pg_stat_activity where datname = current_database()) as connections,
               (select setting::int from pg_settings where name = 'max_connections') as max_connections,
               version() as version`,
    ]);

  const k = kpis[0] ?? {};
  return {
    days,
    kpis: {
      users: num(k.users),
      usersNew: num(k.users_new),
      workspaces: num(k.workspaces),
      workspacesNew: num(k.workspaces_new),
      revenue: num(k.revenue_cents) / 100,
      revenueAll: num(k.revenue_all_cents) / 100,
      purchases: num(k.purchases),
      creditsOutstanding: num(k.credits_outstanding),
      keysActive: num(k.keys_active),
      monitorsActive: num(k.monitors_active),
      crawlsRunning: num(k.crawls_running),
      requests: num(k.requests),
      errors: num(k.errors),
      clientErrors: num(k.client_errors),
      credits: num(k.credits),
      cached: num(k.cached),
      p50: Math.round(num(k.p50)),
      p95: Math.round(num(k.p95)),
    },
    series: series.map(
      (r): DayPoint => ({
        day: String(r.day),
        requests: num(r.requests),
        errors: num(r.errors),
        credits: num(r.credits),
        signups: num(r.signups),
        revenue: num(r.revenue),
        p50: Math.round(num(r.p50)),
        p95: Math.round(num(r.p95)),
      }),
    ),
    endpoints: endpoints.map((r) => ({
      endpoint: String(r.endpoint),
      requests: num(r.requests),
      credits: num(r.credits),
      avgMs: num(r.avg_ms),
      p95: Math.round(num(r.p95)),
      errors: num(r.errors),
    })),
    topWorkspaces: topWorkspaces.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      balance: num(r.balance),
      requests: num(r.requests),
      used: num(r.used),
      lastSeen: r.last_seen as Date | null,
    })),
    signups: signups.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      email: String(r.email),
      image: (r.image as string | null) ?? null,
      createdAt: r.created_at as Date,
    })),
    purchases: purchases.map((r) => ({
      id: num(r.id),
      orgId: String(r.org_id),
      workspace: String(r.workspace),
      delta: num(r.delta),
      amount: r.amount_usd_cents === null ? null : num(r.amount_usd_cents) / 100,
      reason: String(r.reason),
      createdAt: r.created_at as Date,
    })),
    failures: failures.map((r) => ({
      createdAt: r.created_at as Date,
      endpoint: String(r.endpoint),
      status: num(r.status),
      target: (r.target as string | null) ?? null,
      durationMs: num(r.duration_ms),
      workspace: String(r.workspace),
    })),
    contacts: contacts.map((r) => ({
      id: num(r.id),
      name: String(r.name),
      email: String(r.email),
      company: (r.company as string | null) ?? null,
      volume: (r.volume as string | null) ?? null,
      message: String(r.message),
      createdAt: r.created_at as Date,
    })),
    system: {
      dbBytes: num(system[0]?.db_bytes),
      connections: num(system[0]?.connections),
      maxConnections: num(system[0]?.max_connections),
      version: String(system[0]?.version ?? "").split(" on ")[0] ?? "",
    },
  };
}

export type Overview = Awaited<ReturnType<typeof overview>>;

export interface QueueStat {
  name: string;
  workers: number;
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  completed: number;
}

/** Queue depth from the API, and whether the API itself answers. Never throws. */
export async function serviceHealth() {
  const secret = process.env.INTERNAL_API_SECRET;
  const started = performance.now();
  const [health, queues] = await Promise.all([
    fetch(new URL("/health", SITE.apiUrl), { signal: AbortSignal.timeout(4000), cache: "no-store" })
      .then(async (r) => ({
        ok: r.ok,
        ms: Math.round(performance.now() - started),
        body: await r.json(),
      }))
      .catch(() => ({ ok: false, ms: null, body: null })),
    secret
      ? fetch(new URL("/internal/queues", SITE.apiUrl), {
          headers: { [`x-${BRAND.header("internal")}`]: secret },
          signal: AbortSignal.timeout(4000),
          cache: "no-store",
        })
          .then((r) => (r.ok ? (r.json() as Promise<{ queues: QueueStat[] }>) : null))
          .catch(() => null)
      : Promise.resolve(null),
  ]);
  return {
    api: {
      ok: health.ok,
      ms: health.ms,
      version: (health.body as { version?: string } | null)?.version ?? null,
    },
    queues: queues?.queues ?? null,
  };
}
