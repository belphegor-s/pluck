# Scaling and capacity

Pluck separates cheap work from expensive work on purpose. Knowing which is which tells you what to add when.

| Work | Cost per call | Scales by |
| --- | --- | --- |
| HTTP scrape, parse, map | ~50 ms of CPU | API replicas |
| Browser render, screenshot, styleguide | 1–3 CPU-seconds, 300–500 MB | Worker replicas |
| Crawl | One browser render per page, in parallel | Worker replicas |
| Extract, classify | Milliseconds locally; the model provider does the work | Provider rate limits |
| Cached anything | One Redis round trip | Nothing |

The API is stateless, so replicas scale linearly. Everything expensive runs through a Redis queue, so capacity is a matter of adding workers anywhere, including a different cloud.

## What one small server does

Measured on 4 vCPU / 7.5 GB running the full stack (API, worker, web, MCP, Postgres, two Redis, SearXNG):

- Two concurrent browser renders use about 2.5 cores and 650 MB.
- Sustained throughput is roughly **40 browser renders per minute**, and several hundred HTTP scrapes per minute.
- CPU is the limit, then disk. Memory has headroom.

That is enough for an API serving ordinary traffic. It is not enough to crawl a large site while also serving requests, because a crawl saturates every browser slot it is given.

Set `BROWSER_CONCURRENCY` to roughly half the cores you can spare, never more than cores minus one. Each browser wants 300–500 MB.

## Adding capacity

A worker owns no state. Give it `DATABASE_URL`, `REDIS_URL` and `PLUCK_ENCRYPTION_KEY` and it starts taking jobs:

```bash
DATABASE_URL=postgres://… REDIS_URL=redis://… PLUCK_ENCRYPTION_KEY=… \
  docker compose -f deploy/worker-remote.yml up -d
```

Split duties across machines with `WORKER_ROLES`:

| Role | Does |
| --- | --- |
| `render` | Browser renders for scrape, screenshot and styleguide |
| `crawl` | Whole-site crawls |
| `monitor` | Scheduled monitor checks |
| `webhook` | Outbound webhook delivery with retries |
| `maintenance` | Monitor scheduling and data retention |

Keep `maintenance` on exactly one machine. The others can run anywhere, in any number.

## Offloading the heavy half to a cloud

A sensible split once one server is not enough: keep the API, dashboard, Postgres and Redis on a cheap fixed server, and burst browser work into a cloud that bills by the second.

1. **Private network first.** Workers need Postgres and Redis. Join both sides with Tailscale or WireGuard, or peer the VPCs. Do not put a database on the public internet to make this work.
2. **Run the worker image** (`--target worker`) on ECS Fargate, an EC2 spot group, or any container host. One task per 1 vCPU / 2 GB with `BROWSER_CONCURRENCY=2` is a good unit.
3. **Scale on queue depth**, not CPU. The render queue length is the honest signal: a queue that is growing means users are waiting.
4. **Stay in one region.** Put workers near the database: cross-region round trips cost more than the render.

The economics are comfortable: a browser render costs 3 credits, and a 1 vCPU container that manages roughly 1,400 renders an hour costs a few cents an hour. Egress and object storage, not compute, tend to dominate once volume is real.

## When to move the state

Add these in order, as they start to hurt:

1. **Object storage off the box** (screenshots, logos), done from the start if `S3_*` is set.
2. **Managed Postgres** when write volume or backup requirements outgrow a single container. `usage_event` is the table that grows; it is already indexed on `(user_id, created_at)` and pruned after 400 days.
3. **Separate cache Redis** from the queue Redis, because the queue must never evict. The compose file ships both.
4. **Read replicas** for the dashboard's usage queries, if reporting starts competing with the API.

## Housekeeping

- Docker build cache grows quickly on a build host. Coolify prunes when the disk crosses its threshold; check free space after a run of deploys.
- Crawl results are deleted after 7 days, monitor history after 90, usage after 400.
- The scrape cache is the cheapest capacity you can buy: raising `maxAge` on repeated URLs removes the work entirely.
