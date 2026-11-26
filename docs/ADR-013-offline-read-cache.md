# ADR-013: Offline read-cache for the rep PWA — IndexedDB-backed entity stores, write queue deferred

## Status
Accepted

## Context
`apps/pwa` is meant to be offline-first, but today it isn't: `apps/pwa/src/utils/api.ts` is a plain `fetch` wrapper with a hard timeout and a 401 interceptor — no retry, no response caching, no queueing. `vite-plugin-pwa` is configured (`apps/pwa/vite.config.ts`) but `/api/` and `/auth/` are explicitly `NetworkOnly` in the Workbox runtime-caching config, so the service worker deliberately never touches API traffic. `useEntityList.ts` (shared by `HCPView`, `HCOView`, `LeadsView`, `PatientsView`, `UsersView` via `AppEntityList.vue`) holds list data in local `ref`s — nothing survives a route change or reload. Detail views (`HCPDetailView.vue`, `HCODetailView.vue`, `LeadDetailView.vue`, `UserDetailView.vue`, `PatientDetailView.vue`) each have their own bespoke `loadX()` fetch-by-id function, not a shared composable.

`docs/foundation/FEATURE_BACKLOG.md` lists a single backlog line — "Offline-first PWA … Service Worker + IndexedDB + Background Sync + sync_queue server table" — as a Stage 8 item. That bundles two architecturally distinct problems together:

1. **Read cache** — a rep who has already opened a list or a record should be able to see it again with no network (spotty signal in a clinic, elevator, rural territory). This is read-only, has no conflict semantics, and never touches the API contract.
2. **Write queue** — a PCF or edit submitted offline must be queued, replayed with idempotency, and reconciled against concurrent edits from another user (e.g. FFM editing the same lead). This requires a server-side `sync_queue` table, idempotency keys on mutation endpoints, and a conflict model — a genuinely new subsystem, not a frontend-only change.

The write-queue half is deferred: it needs its own ADR before implementation (idempotency key format, conflict resolution strategy, `sync_queue` schema) and is out of scope here. This ADR covers only the read-cache half, which is additive, reversible, and safe to build now rather than waiting for Stage 8, because it doesn't touch the API contract or the DB schema.

## Decision

### 1. Rename `utils/api.ts` → `composables/useApi.ts`
The canonical pipeline (`CLAUDE.md`, this skill) names `useApi.ts` as the one fetch composable. The file that actually plays that role was left at its old name (`utils/api.ts`) — naming drift from before the pipeline convention was written down. Fixed now, before building a new layer on top of it, so the new code is written against the name the docs already promise. All 22 import sites updated; no behavior change.

### 2. IndexedDB wrapper, scoped per tenant + user
New `apps/pwa/src/lib/offlineCache.ts` wraps `idb` (added as a dependency — no existing IndexedDB/Dexie/localForage usage in the repo). One IndexedDB database per `(tenant, user id)` pair (`neocrm-cache-${tenant}-${userId}`), not a single shared database. A rep switching tenants or logging out on a shared device must not see the previous session's cached HCP/lead records — DB-per-session-identity makes that a `deleteDatabase()` call rather than a query that could leak data if forgotten. Schema is versioned (`idb`'s `upgrade` callback) so future field/entity changes don't require users to manually clear their cache.

### 3. Generic Pinia store factory, not one handwritten store per entity
New `apps/pwa/src/stores/entityCache.ts` exports `createEntityCacheStore(entityName: string)`. Every cacheable entity (`hcp`, `hco`, `lead`, `users`) gets its store via this factory, not a hand-copied file — matching the existing generic-composable style already established by `useEntityList` and `FormRenderer`, and keeping the naming pipeline's "one name, all the way through" rule from fragmenting into five near-duplicate stores.

### 4. Read cache is opt-out per entity, `patient` opts out today
`patient` carries GDPR Art. 9 special-category data (diagnosis codes). IndexedDB is unencrypted browser storage, and IndexedDB is exactly the layer at risk from a lost or shared device. Caching HCP/HCO/lead/user records offline has no such exposure; caching patient records does, and that tradeoff hasn't been made yet. `AppEntityList` gets a `cacheable` prop, default `true`; `PatientsView.vue` passes `cacheable="false"`. The door stays open — nothing in the cache layer is patient-specific, so enabling it later is a one-line prop flip once `/legal` has signed off, not a rearchitecture.

### 5. Write-through on success, fallback on failure — lists and detail views
`useEntityList.ts` and the four non-patient detail-view `loadX()` functions: on a successful GET, mirror the result into the entity's cache store (list results as individual per-id upserts, not as a cached "page" — see below); on a network failure (not a 4xx/5xx from the server, which still means "reachable"), read from the cache store and surface a `fromCache`/`offline` flag so the UI can show a "showing saved data" state instead of silently pretending the fetch succeeded.

### 6. Cache individual records, not query result pages
List queries (filters, search, sort, pagination) are not cached as pages — that needs its own invalidation model and doesn't match what was asked for ("things already viewed"). Instead every record that passes through a list response or a detail fetch gets upserted into IndexedDB by id. Offline, "recently viewed" is a local read of whatever ids are in the cache, filtered/sorted client-side — not an attempt to replay the server's query offline.

### 7. Cache cleared on logout
`clearAuth()`/`logout()` in `stores/auth.ts` triggers `deleteDatabase()` on the per-session cache. Prevents a stale session's cached data from lingering after logout on a shared device.

## Consequences
- New dependency: `idb` (thin typed wrapper over the native IndexedDB API, no bundled Dexie/localForage-style abstraction layer).
- `useEntityList.ts` and four detail views gain cache read/write branches — modest, mechanical changes, not a rewrite of their fetch logic.
- `patient` stays network-only offline until a follow-up (with `/legal` sign-off) explicitly enables it — tracked here, not silently dropped.
- Write-queue offline (PCF submission, edits) is explicitly **not** covered by this ADR and needs its own decision (idempotency keys, `sync_queue` table, conflict resolution) before implementation.
- `docs/foundation/FEATURE_BACKLOG.md`'s single "Offline-first PWA" Stage 8 line is split: read-cache ships now, write-queue stays backlogged.

## Compliance Impact
- `patient` (GDPR Art. 9) is excluded from client-side persistent storage until a deliberate decision is made to include it — avoids introducing an unreviewed at-rest exposure of special-category data on rep devices.
- Per-tenant, per-user IndexedDB scoping with deletion on logout is the control that prevents cross-tenant/cross-user data leakage on shared or lost devices — required given `HCP`/`HCO`/`lead` records are personal data under GDPR Art. 6 even without the Art. 9 sensitivity of `patient`.
- No server-side change, no new personal-data category, no change to the GDPR data map beyond noting that HCP/HCO/lead/user records may now also exist, transiently, in browser-local IndexedDB storage on the rep's device.
