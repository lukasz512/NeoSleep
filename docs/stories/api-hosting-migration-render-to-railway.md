## Refined User Story: Migrate apps/api hosting from Render (free plan) to Railway.io

**Classification**: feature (infrastructure/architecture change — non-trivial, cross-cutting, budget-constrained)
**Linear**: NEO-45

**Raw input**: "moje API jest zbyt wolne. chcialbym przejsc na jakis platny plan, ale 20usd za miesiac to dla mnie za duzo - max 5. co mi zaproponujesz zamiast rendera? chce zeby przepiecie trwalo 5 minut i nowe bylo tanie... testy i automatyzacja ma dzialac zajebiscie od samego poczatku."

Follow-up clarified via AskUserQuestion:
- Slowness is **persistent even when the service is "warm"**, not just first-request cold-start.
- Chosen target platform: **Railway.io, Hobby plan ($5/month flat)**.
- Session running in an isolated git worktree.

Further follow-up (same session): Łukasz asked to first verify how bad it actually is on prod, and whether a keep-alive job could avoid Render's free-tier spin-down before committing to a paid migration. See NEO-45 for the diagnosis-first plan this triggered.

### As a NeoCRM operator (Łukasz), I want to move apps/api off Render's free plan onto a $5/month Docker-based host so that field reps get consistently fast API responses, without exceeding a hard $5/month budget.

### Stakeholder Notes
- 👤 User (rep/KAM/FFM/MSL): Indirect but real — every PWA screen that reads/writes through the API currently pays Render free-tier latency. Faster, consistent responses improve day-to-day usability, especially for anything hit repeatedly during a visit (PCF save, HCP lookup).
- 🏢 Client (tenant/pharma company): Invisible to them unless slowness is already hurting adoption/complaints. No client-visible feature, but underpins retention of every white-label tenant currently on the platform.
- 🩺 Patient: No direct effect. Indirect-at-most: if PCF/visit-plan forms are slow enough to cause reps to abandon or delay data entry, that could soft-touch care-coordination timeliness — but this is speculative, not a driver for this change.
- 🚀 NeoCRM/Platform: Yes — this benefits every current and future tenant, since all of them ride the same apps/api deployment. Also sets a precedent for how the next infra migration (the already-planned pwa/web GoDaddy→VPS move) gets executed and documented.
- ⚖️ Compliance: **Flag, not resolved here.** Current Render service is pinned to `region: frankfurt` (EU). Moving compute to a new provider must keep PII processing inside an EU region for PL market GDPR purposes — DB storage stays on Supabase unchanged, but the API process itself handles PII in memory/transit. Confirm Railway's region before committing. → escalate region choice to `/arch` or `/legal` if EU-only options are unclear or unavailable on the Hobby plan.

### Medical-Industry Trend Check
n/a — internal infrastructure change, not user-facing product behavior.

### Key findings from repo inspection (not in the original ask — surfacing because they change scope)
1. **`apps/api/Dockerfile` already exists** (multi-stage, non-root user, built-in `/health` HEALTHCHECK) — the "make it Docker-based" part of the ask is largely already done in principle.
2. **But Render's actual `render.yaml` does NOT use that Dockerfile.** It builds via `runtime: node` + a plain `pnpm --filter "@neo/api..." build` buildCommand. This means the Dockerfile may never have been used as a real deploy artifact and its build path is unverified.
3. **The Dockerfile likely doesn't build as-is.** `apps/api/package.json` depends on `@neo/documents` and `@neo/email` (workspace:* packages), but the Dockerfile only `COPY`s `apps/api/package.json` — not `packages/documents` or `packages/email` source. `pnpm install --frozen-lockfile` inside the image would have nothing to link those workspace deps to. This matches a known project lesson (pnpm typecheck needing `@neo/email`/`@neo/documents` built first) — the Dockerfile was very likely written before that lesson was learned, or never actually run.
4. **`render.yaml`'s env var list is not the full picture** — every secret is `sync: false`, meaning actual values only exist in the Render dashboard. Migrating requires pulling current values from there, not just from the repo file.
5. **Confirmed live 2026-09-21**: `pwa.neosleepcare.com` (prod PWA bundle, `assets/index-*.js`) bakes in `https://neosleep-bff.onrender.com` as its API base URL — the **same single Render service that tracks the `dev` branch** per `render.yaml` and `secrets/accounts.md`. There is no separate prod API deployment today, despite a `RENDER_API_URL_PROD` secret existing in the pwa deploy workflow. Manual `/health` timing at that moment: ~0.2-0.5s across 6 requests, no dramatic cold-start spike observed — inconclusive on its own (see NEO-45 for the diagnosis-first plan before committing to this migration).

### Acceptance Criteria (testable)
- [ ] `docker build -f apps/api/Dockerfile .` succeeds locally, including `@neo/email` and `@neo/documents` being correctly resolved/built inside the image (fix the missing `COPY`/build steps for those packages if it currently fails)
- [ ] Running container serves `/health` with 200 and can reach Supabase (`DATABASE_URL`) successfully
- [ ] Full current env var list exported from Render dashboard (not assumed from `render.yaml`) and replicated in Railway
- [ ] Railway region selected and documented, with an explicit note on whether it satisfies EU-data-processing expectations for the PL market
- [ ] Railway deployment passes a smoke test (login flow + one basic authenticated read) before any frontend cutover
- [ ] `apps/pwa` / `apps/web` API base URL is switched only after the smoke test passes — documented as a single, reversible config change (env var / DNS), not a code change
- [ ] Render service is kept alive (not deleted) for a defined rollback window after cutover; rollback = revert the one config value, no redeploy needed
- [ ] Existing `pnpm test` suite passes unchanged — this migration does not introduce a Docker-only test dependency
- [ ] Actual Railway invoice after first billing cycle confirmed ≤ $5/month
- [ ] `render.yaml` either removed or clearly marked deprecated once Render is decommissioned, so it doesn't mislead the next person

### Open Questions
- [ ] Has `apps/api/Dockerfile` ever been successfully built end-to-end? (Evidence above suggests no — Render bypasses it entirely.)
- [x] **Answered 2026-09-21**: Railway has exactly 4 regions — US West (California), US East (Virginia), EU West (Amsterdam), Southeast Asia (Singapore). None are in/near Mexico, but US West/East cut estimated network latency to Mexico City roughly in half vs. Frankfurt (~150-190ms → ~40-80ms RTT). **This is a real, single-region trade-off, not a free win**: the $5 Hobby budget supports one service in one region — picking a US region to help MX-based reps means PL/EU traffic no longer gets an EU-local hop, and processing PL reps' personal data outside the EU raises a GDPR international-transfer question (needs Railway's DPA/SCC terms checked — not fatal, standard for reputable providers, but unverified here). Separately: Łukasz's own "mega wolne" test from Spain (geographically close to Frankfurt) strongly suggests Render's `plan: free` CPU throttling — not distance — is the dominant cause of today's slowness; moving to Railway's non-throttled compute should help regardless of which region is picked. **Open decision for Łukasz**: pick US West as the single region (optimizes for MX, accepts worse PL latency + GDPR check) vs. keep EU West (optimizes for PL/GDPR, MX stays far — though still likely faster than today just from leaving the free tier).
- [ ] What is the acceptable rollback window before Render is decommissioned (e.g. 1-2 weeks), and who signs off that Railway is stable before that window closes?
- [ ] Should the same Dockerfile be reused for local dev (currently `pnpm start` runs Postgres-in-Docker + API + app directly via pnpm, not via this Dockerfile), or should local dev and the Railway deploy artifact stay as two separate, intentionally different setups?
- [ ] Does Łukasz want a GitHub Actions workflow added for the API deploy (there is none today — Render's git-push-is-the-pipeline model), or should Railway's own native git-push-to-deploy be used the same way, keeping "no GitHub Actions for the API" as-is?
- [ ] Pending NEO-45 diagnosis: is this migration even necessary if a $0 keep-alive job resolves the perceived slowness? Don't spend the $5/month or the migration effort until that's ruled out.

### Hand-off
→ `/devops` — to turn this into a concrete Railway setup + cutover runbook (region choice, env var migration, health-check-gated cutover, rollback window) — **only after NEO-45's diagnosis step rules out a cheaper fix**
→ `/arch assess` — specifically for the GDPR/EU-region question before Railway region is finalized
