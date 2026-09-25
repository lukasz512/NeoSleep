# =============================================================================
# NeoSleep API — container image for Google Cloud Run (NEO-45, ADR-025)
#
# Build context: repo root.
#   docker build --platform linux/amd64 -f apps/api/Dockerfile -t neo-api .
#
# Why it looks like this:
# - Debian (bookworm-slim), not Alpine: @sparticuz/chromium (PDF documents) ships a
#   glibc build and fails on musl. See services/documentRenderer.ts.
# - linux/amd64: that Chromium binary is x86_64 only, and Cloud Run runs amd64.
# - The workspace layout (/app/apps/api, /app/packages/*) is kept as-is in the final
#   image, because @neo/documents and @neo/email read templates, assets and
#   packages/i18n/*.json relative to their own dist/ folders at runtime.
# - Same build command as CI and Render: pnpm --filter "@neo/api..." build.
# - Node major must match .nvmrc (src/dockerfile.spec.ts checks it): supabase-js needs
#   Node 22+ (native WebSocket), and on node:20 every Storage call failed.
# =============================================================================

FROM node:22-bookworm-slim AS build
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

COPY . .
RUN pnpm install --frozen-lockfile --filter "@neo/api..."
RUN pnpm --filter "@neo/api..." build

# Swap to production-only dependencies, keeping the same workspace layout.
RUN rm -rf node_modules apps/api/node_modules \
 && pnpm install --frozen-lockfile --prod --filter "@neo/api..."


FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
# Chromium's network stack (NSS) needs libsqlite3 the moment a document fetches anything
# over HTTPS — e.g. the Google Fonts every template loads. It is not in @sparticuz/chromium's
# bundled libs nor in bookworm-slim; without it Chromium aborts ("Connection closed").
RUN apt-get update \
 && apt-get install -y --no-install-recommends libsqlite3-0 ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules

COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/migrations ./apps/api/migrations

COPY --from=build /app/packages/documents/package.json ./packages/documents/package.json
COPY --from=build /app/packages/documents/dist ./packages/documents/dist
COPY --from=build /app/packages/documents/templates ./packages/documents/templates
COPY --from=build /app/packages/documents/assets ./packages/documents/assets

COPY --from=build /app/packages/email/package.json ./packages/email/package.json
COPY --from=build /app/packages/email/dist ./packages/email/dist
COPY --from=build /app/packages/email/assets ./packages/email/assets

COPY --from=build /app/packages/i18n/en.json /app/packages/i18n/pl.json /app/packages/i18n/mx.json ./packages/i18n/

# Unprivileged user. Chromium unpacks itself into /tmp, which stays writable.
USER node
WORKDIR /app/apps/api
EXPOSE 8080
CMD ["node", "dist/server.js"]
