# ADR-015: One name for the API server

## Status
Accepted

## Context
`apps/api` had picked up a second, informal name across code comments and docs — used interchangeably with "the API server" to mean the exact same Express app. NeoCRM has exactly one backend: `apps/api` owns auth, the DB connection, and every external API call (Architecture Rule #1 in `CLAUDE.md`). There was never a separate service behind that second name, and none is planned — carrying two names for one thing cost a reader a lookup for zero information gained.

## Decision
`apps/api` is called "the API server" (or just "the API") everywhere — code comments, docs, and composable names. The frontend fetch composable `useApi.ts` (in `apps/pwa/src/composables/`) is named for exactly what it does: call the API.

Affected: `CLAUDE.md`, `docs/SECURITY_MODEL.md`, `docs/lessons.md`, `docs/ADR-010-audit-log-immutability.md`, `docs/API_CONTRACT.md`, `docs/features.md`, `docs/foundation/FEATURE_BACKLOG.md`, code comments in `apps/api/src`, and the `apps/pwa/src/composables/useApi.ts` composable (previously under a different file name).

**Also folded into this pass** (same motivation — one name per thing, no stale synonyms):
- CI/CD workflow and deploy-infra identifiers for `apps/api` — renamed for the same reason (see commit history for the exact renames).
- Root `README.md`, `docs/RUNBOOK_LOCAL_DEV.md`, `apps/web/README.md`, `packages/brand/README.md` — updated to reference the current monorepo layout (`apps/pwa`, `apps/web`, `apps/api`, `apps/telegram`); they still described a pre-rename workspace layout from before the July 2026 `services/` → `apps/` restructure.

## Consequences
- One name for the one backend, everywhere it's mentioned in source, docs, and deploy config.
- No behavior change — this is a naming-only ADR.

## Compliance Impact
None.
