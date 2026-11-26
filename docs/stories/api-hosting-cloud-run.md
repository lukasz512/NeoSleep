## Refined User Story: Move apps/api from Render (Frankfurt) to Google Cloud Run (Los Angeles)

**Classification**: feature (infrastructure/architecture change, cross-cutting)
**Linear**: NEO-45
**Supersedes**: [api-hosting-migration-render-to-railway.md](api-hosting-migration-render-to-railway.md) (Railway plan, not pursued)

**Raw input**: "db jest w usa, api we frankfurcie. czy to moze powodowac duze opoznienia? ... chce zeby to bylo tanie ale ma dzialac szybciej niz teraz ... ok teraz przenosimy API (i baze tez? ile kosztuje baza na google? moze narazie tylko api?)"

Decisions made by Łukasz, 2026-09-25:
- Move the **API only**. The DB stays on Supabase Free (us-west-1).
- New GCP project **NeoSleep API**. Region **us-west2 (Los Angeles)**, next to the DB.
- **Two services, dev and prod**, both scaling to zero and sharing the one Supabase DB for now. Migrations must stay additive-only. A separate dev DB is its own ticket.
- Default `*.run.app` URLs for now; no custom domain yet.
- Budget: roughly 0–5 zł/month.

### As a field user (rep, doctor, manager), I want every screen of the app to respond quickly, so that I can work during a visit without waiting on the network.

### Stakeholder Notes
- 👤 User: Every API call today pays ~150 ms per DB round trip, and there are 4+ per request, because the API sits in Frankfurt and the DB in California. Render Free also adds cold-start waits. Co-locating the two removes most of that.
- 🏢 Client: A fast app is a baseline adoption requirement. Separate dev and prod also stops a push to `dev` from changing what prod users run, which is the case today.
- 🩺 Patient: Indirect only. Faster data entry during visits lowers the chance of rushed or skipped records.
- 🚀 NeoCRM/Platform: Cloud Run gives a Docker-based, region-selectable host. The same image can later be deployed to an EU region for the planned EU stack.
- ⚖️ Compliance: API processing moves from the EU (Frankfurt) to the US (Los Angeles). The data at rest was already in the US (Supabase us-west-1), so the transfer position is unchanged in substance. PL patient data is still a `/legal` question for the future EU stack.

### Medical-Industry Trend Check
n/a — internal infrastructure change.

### Acceptance Criteria
- [ ] `docker build -f apps/api/Dockerfile .` builds a working image, including `@neo/documents` / `@neo/email` and every runtime file (migrations, templates, assets, i18n JSON). CI builds it on every relevant PR.
- [ ] A PDF document renders inside the container (Chromium works on the chosen base image).
- [ ] Migrations take a Postgres advisory lock, so parallel startups (dev, prod, Render during the transition) never apply a file twice. Each file and its bookkeeping row commit atomically. This is covered by an integration test against real Postgres.
- [ ] The API shuts down gracefully on SIGTERM, and the DB pool size is configurable.
- [ ] A push to `dev` deploys `neosleep-api-dev` and a push to `prod` deploys `neosleep-api-prod` (us-west2, min 0 / max 1 instance). GCP access is keyless (Workload Identity Federation). Secrets live in Secret Manager, never in the repo or workflow logs.
- [ ] After deploy, `/health` returns 200, Google and password login work, lists load, a Storage attachment round-trips, a PDF and an email send, all on both services.
- [ ] The same list view is measurably faster than on Render (before/after timing recorded).
- [ ] Frontends switch via the `API_URL_DEV` / `API_URL_PROD` GitHub secrets. Rollback is switching them back to the Render URL.
- [ ] A runbook documents deploy, rollback, logs and secrets.

### Open Questions
- none blocking. Deferred to their own tickets: separate dev DB, `api.neosleepcare.com`, DB-backed OrthoApnea queue/rate limits (only needed above one instance), a scheduler for the OrthoApnea status-sync job.

### Hand-off
→ `/devops` + `/dev`, per the approved plan (ADR-025).
