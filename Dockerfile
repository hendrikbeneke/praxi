# syntax=docker/dockerfile:1

# node:24-alpine matches `engines.node` (>=24 <25); @node-rs/argon2 ships a
# prebuilt musl binary (see pnpm-lock.yaml), so alpine needs no native
# toolchain at all.
FROM node:24-alpine AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.20.0 --activate

# ── deps: full workspace install, including devDependencies, for building ──
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile

# ── build: shared, server, web (pnpm -r builds in dependency order, so
#    @praxi/shared lands in dist/ before apps/server and apps/web read it) ──
FROM deps AS build
COPY . .
RUN pnpm build

# ── prod-deps: production-only install for @praxi/server and what it depends
#    on (@praxi/shared) — apps/web needs no runtime footprint, its build
#    output is static files already written into apps/server/public ──
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --prod --frozen-lockfile --filter @praxi/server...

# ── runtime: slim image, non-root ──
FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

# node_modules trees mirror the workspace layout on purpose: pnpm links them
# as relative symlinks into a central .pnpm store, and they only resolve
# correctly if that layout — and its depth under /app — stays identical to
# where prod-deps produced them.
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=prod-deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=prod-deps /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=prod-deps /app/apps/server/package.json ./apps/server/package.json
COPY --from=prod-deps /app/packages/shared/package.json ./packages/shared/package.json

COPY --from=build /app/apps/server/dist ./apps/server/dist
# index.ts resolves the SPA directory relative to process.cwd(), the same way
# `pnpm start` does locally from the repo root — this image keeps the same
# apps/server/... shape so that resolution lands in the same place.
COPY --from=build /app/apps/server/public ./apps/server/public
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
# drizzle-kit writes migrations as plain .sql, tsc never touches them
# (tsconfig.json excludes the folder) — copied separately, next to the
# compiled migrate.js that reads them at runtime.
COPY --from=build /app/apps/server/src/db/migrations ./apps/server/dist/db/migrations

USER node

EXPOSE 3000

# No curl/wget in this image — Node's own fetch is enough, and one less
# package keeps the image as slim as asked for.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Migrations run before the server starts listening, not as a Coolify
# pre/post-deployment hook — see DEPLOY.md for why. `exec` hands PID 1 to
# node so it receives SIGTERM directly for the graceful shutdown in index.ts.
CMD ["sh", "-c", "node apps/server/dist/db/migrate.js && exec node apps/server/dist/index.js"]
