# =============================================================================
# NeoSleep BFF — multi-stage Docker build
# Build context: repo root (so pnpm workspace deps are accessible)
# Usage: docker build -f apps/api/Dockerfile -t neo-api .
# =============================================================================

# Stage 1: builder — install all deps and compile TypeScript
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace manifests and lockfile first (layer cache)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/package.json
COPY tsconfig.base.json ./

# Install all workspace dependencies
RUN pnpm install --frozen-lockfile

# Copy API source and compile
COPY apps/api/src ./apps/api/src
COPY apps/api/tsconfig.json ./apps/api/tsconfig.json

WORKDIR /app/apps/api
RUN pnpm exec tsc -p tsconfig.json

# Stage 2: production — minimal image with non-root user
FROM node:20-alpine AS production

RUN corepack enable && corepack prepare pnpm@latest --activate

# Create non-root user
RUN addgroup -S bff && adduser -S -u 1001 -G bff bff

WORKDIR /app

# Copy workspace manifests (needed for pnpm to resolve workspaces)
COPY --chown=bff:bff package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY --chown=bff:bff apps/api/package.json ./apps/api/package.json

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy compiled output and migrations
COPY --from=builder --chown=bff:bff /app/apps/api/dist ./apps/api/dist
COPY --chown=bff:bff apps/api/migrations ./apps/api/migrations

WORKDIR /app/apps/api

USER bff

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "dist/server.js"]
