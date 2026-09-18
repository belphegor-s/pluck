# syntax=docker/dockerfile:1.7
# One Dockerfile, one build graph, four slim runtime targets:
#   docker build --target api|worker|mcp|web -t pluck-<target> .

ARG NODE_VERSION=24.15.0
ARG PNPM_VERSION=11.26.0

FROM node:${NODE_VERSION}-bookworm-slim AS base
ARG PNPM_VERSION
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true NEXT_TELEMETRY_DISABLED=1
# Installed straight from the registry: corepack's own downloader is an extra
# network dependency that fails on some hosts, and the version is pinned anyway.
RUN npm install -g --ignore-scripts pnpm@${PNPM_VERSION} && pnpm --version
WORKDIR /repo

# ---------------------------------------------------------------- deps
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/mcp/package.json apps/mcp/
COPY apps/web/package.json apps/web/
COPY packages/ai/package.json packages/ai/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/runtime/package.json packages/runtime/
COPY packages/sdk/package.json packages/sdk/
COPY packages/shared/package.json packages/shared/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm fetch --frozen-lockfile

# --------------------------------------------------------------- build
FROM deps AS build
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --offline
ARG NEXT_PUBLIC_API_URL=https://pluck-api.procd.cc
ARG NEXT_PUBLIC_SITE_URL=https://pluck.procd.cc
ARG NEXT_PUBLIC_MCP_URL=https://pluck-mcp.procd.cc
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL NEXT_PUBLIC_MCP_URL=$NEXT_PUBLIC_MCP_URL
RUN pnpm turbo run build
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm --filter @pluck/api deploy --prod --prefer-offline /out/api && \
    pnpm --filter @pluck/worker deploy --prod --prefer-offline /out/worker && \
    pnpm --filter @pluckai/mcp deploy --prod --prefer-offline /out/mcp

# ----------------------------------------------------------------- api
FROM node:${NODE_VERSION}-bookworm-slim AS api
ENV NODE_ENV=production PORT=8080
WORKDIR /app
COPY --from=build --chown=node:node /out/api ./
USER node
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s CMD node -e "fetch('http://127.0.0.1:8080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "-c", "node node_modules/@pluck/db/dist/migrate.js && exec node --enable-source-maps dist/index.js"]

# -------------------------------------------------------------- worker
FROM node:${NODE_VERSION}-bookworm-slim AS worker
ENV NODE_ENV=production PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /app
COPY --from=build /out/worker ./
# Headless shell only: ~40% smaller than full Chromium and faster to start.
RUN node node_modules/playwright-core/cli.js install --with-deps --only-shell chromium && \
    rm -rf /var/lib/apt/lists/* /tmp/* && \
    chown -R node:node /app /ms-playwright
USER node
# The worker serves no HTTP, but the orchestrator still inspects container
# health after a rolling update, so report liveness of the Node process.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s CMD ["node", "-e", "process.exit(0)"]
CMD ["node", "--enable-source-maps", "dist/index.js"]

# ----------------------------------------------------------------- mcp
FROM node:${NODE_VERSION}-bookworm-slim AS mcp
ENV NODE_ENV=production PORT=8081
WORKDIR /app
COPY --from=build --chown=node:node /out/mcp ./
USER node
EXPOSE 8081
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s CMD node -e "fetch('http://127.0.0.1:8081/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/http.js"]

# ----------------------------------------------------------------- web
FROM node:${NODE_VERSION}-bookworm-slim AS web
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=45s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]
