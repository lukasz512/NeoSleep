# ADR-025 — API hosting on Google Cloud Run (us-west2), next to the database

**Status**: Accepted (2026-09-25)
**Ticket**: NEO-45
**Story**: [docs/stories/api-hosting-cloud-run.md](stories/api-hosting-cloud-run.md)
**Supersedes**: the Railway evaluation in [api-hosting-migration-render-to-railway.md](stories/api-hosting-migration-render-to-railway.md)

## Context

`apps/api` ran on Render Free in **Frankfurt**. The database is Supabase Free in
**us-west-1 (N. California)**. Every request makes several sequential DB round trips
(`withTenant()` alone is BEGIN, SET LOCAL, query, COMMIT) at ~150 ms each across the
Atlantic, so ~0.6–1.5 s of pure network time before any work happens. Render Free
also sleeps after ~15 min idle. One Render service tracked `dev` and served prod as
well, so every push to `dev` changed what prod users ran.

The budget constraint is "as close to free as possible". The DB stays on Supabase Free
for now (Łukasz, 2026-09-25).

## Decision

1. **Host the API on Google Cloud Run in `us-west2` (Los Angeles)**, ~8–10 ms from the DB.
   Co-locating the app server with its database is the standard rule; the region of the
   end users matters much less, because they make one round trip per request while the
   API makes several to the DB.
2. **Two services, `neosleep-api-dev` and `neosleep-api-prod`**, deployed by
   `.github/workflows/deploy-api.yml` on push to `dev` / `prod`. Both scale to zero, so
   the second service costs nothing when idle.
3. **Both services share the one Supabase DB for now.** Consequences:
   - Migrations must stay **additive** (add tables/columns, never drop or rename in the
     same release). Prod runs older code than dev against the same schema.
   - Migrations take a Postgres advisory lock (`db/migrations.ts`), because dev, prod and
     Render (during the transition) all migrate the same DB at startup. Each file commits
     atomically with its `schema_migrations` row.
   - A separate dev DB is a follow-up ticket.
4. **`max-instances = 1` per service.** The OrthoApnea mutation queue and all rate
   limiters are in-memory (`services/partners/orthoapnea.ts`, `middleware/rateLimiter.ts`)
   and are only correct with a single instance. Raising the limit requires moving them to
   the DB first.
5. **Image**: `apps/api/Dockerfile`, Debian `node:20-bookworm-slim`, `linux/amd64`. It is
   not Alpine because `@sparticuz/chromium` (PDF documents) is a glibc x86_64 build. The
   workspace layout is kept inside the image because `@neo/documents` / `@neo/email` read
   templates, assets and `packages/i18n/*.json` relative to their `dist/` at runtime. CI
   builds the image on every PR (`ci.yml` → `api-image`).
6. **Config and secrets**:
   - Non-secret env vars are committed per service (`infrastructure/cloud-run/{dev,prod}.env.yaml`).
   - Secrets live in Secret Manager (`us-west2`) and are mounted by name
     (`infrastructure/cloud-run/secrets.list`).
   - GitHub reaches GCP keylessly via Workload Identity Federation, restricted to this repo's
     `dev` and `prod` branches.
   - The runtime service account can only read secrets.
7. **Separate GCP project `neosleep-api`**, distinct from `neosleep-backups` (NEO-62).
   A mistake or compromise in the API project cannot reach the backups.
8. **Default `*.run.app` URLs.** A custom domain (`api.neosleepcare.com`) would need a load
   balancer in us-west2 (Cloud Run domain mapping is not offered there) or Cloudflare in
   front. That is deferred.

## Consequences

- **Cost**: Cloud Run free tier covers the expected traffic.
  - Secret Manager: 6 free secret versions, then about $0.06/version/month.
  - Artifact Registry: 0.5 GB free, with a cleanup policy keeping 5 images.
  - Expected total ≈ 0–5 zł/month.
- **Cold start** after idle is a few seconds (container start plus migrations check),
  instead of Render Free's 30–60 s. `min-instances=1` would remove it for about 40–60 zł/month
  if ever needed.
- **Graceful shutdown**: the server handles SIGTERM, closing HTTP and draining the pg pool.
  The pool size is set by `DB_POOL_MAX` (10 on Cloud Run) to stay within the Supabase
  Free pooler while several deployments share it.
- **Rollback**: frontends pick the API URL from the `API_URL_DEV` / `API_URL_PROD` GitHub
  secrets, with `RENDER_API_URL_*` as fallback. Rolling back means pointing those back at
  Render and re-running the frontend deploy. Render is removed only after a stable week.
- **Data location**: API processing moves from Frankfurt to Los Angeles. Data at rest was
  already in the US (Supabase us-west-1). The future EU stack (PL data) will be a separate
  deployment of the same image in an EU region, with its own DB.

## Alternatives considered

- **Keep Render, move its region to Oregon**: Render regions can't be changed in place,
  it still needs a paid plan to avoid sleeping, and it is further from the DB than LA.
- **Railway ($5/month)**: no region next to the DB at that price point; see the superseded story.
- **Cloud Run in Mexico (`northamerica-south1`)**: ~50–60 ms per DB round trip while the DB
  is in California, so slower than LA. It makes sense only once the DB also moves to Mexico.
- **Move the DB to Cloud SQL too**: about 40–50 zł/month and a risky data migration for
  little gain today. Revisit when Supabase Free limits are reached.
