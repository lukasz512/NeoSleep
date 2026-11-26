## Data Pipeline — DB to View (Core Expertise)

The architect owns the **full vertical slice**: from PostgreSQL schema to the pixel on screen. This is not just schema design — it is the complete named pipeline for every entity.

### Canonical Pipeline for Any Entity

```
PostgreSQL table         encounter
      ↓ withTenant()
DB function              getEncounters(tenantSlug, filters)   ← apps/api/src/db/encounters.ts
      ↓ Express route
API endpoint             GET /api/encounters                  ← apps/api/src/routes/encounters.ts
      ↓ HTTP (BFF boundary)
BFF composable           useBffApi() → api.get('/encounters') ← apps/pwa/src/composables/useBffApi.ts
      ↓
Feature composable       useEncounters()                      ← apps/pwa/src/composables/useEncounters.ts
      ↓
Pinia store (if shared)  encountersStore                      ← apps/pwa/src/stores/encounters.ts
      ↓
View                     EncountersView.vue                   ← apps/pwa/src/views/EncountersView.vue
      ↓
i18n namespace           user.encounters.*                    ← packages/i18n/en.json
```

**Every layer uses the same noun.** The only thing that changes is the suffix and the layer-specific convention. If you see `visitLog` in the composable but `encounter` in the DB, that is a bug, not a style choice.

### Layer Responsibilities

| Layer | File location | Responsibility | What it must NOT do |
|---|---|---|---|
| `db/*.ts` | `apps/api/src/db/` | SQL queries, parameterized, `withTenant()` | No business logic, no HTTP |
| `routes/*.ts` | `apps/api/src/routes/` | HTTP in/out, auth middleware, validation, audit log | No raw SQL, no frontend concerns |
| `useBffApi.ts` | `apps/pwa/src/composables/` | All HTTP to BFF — the only fetch layer | Direct DB, direct 3rd-party |
| `use[Entity].ts` | `apps/pwa/src/composables/` | Loading, error, filter state for one entity | HTTP calls (use useBffApi) |
| `[entity]Store.ts` | `apps/pwa/src/stores/` | Shared reactive state across views | Business logic, HTTP |
| `[Entity]View.vue` | `apps/pwa/src/views/` | Layout and slot assignment only | Business logic, inline styles |

### When to Add a Pinia Store vs. a Composable

- **Composable only** (`useEncounters.ts`) — data is local to one view or one tree. Loading state, list data, pagination. Destroyed when component unmounts.
- **Pinia store** (`encountersStore`) — data is shared across multiple views, needs to persist during navigation, or drives global UI state (sidebar count, notification badge).

Do not default to Pinia. Start with a composable. Escalate to a store only when sharing is required.

### New Feature Checklist — Pipeline Completeness

```
□ DB table exists with migration
□ DB function in apps/api/src/db/[entity].ts
□ API route in apps/api/src/routes/[entity].ts (requireAuth, withTenant, validation, audit)
□ Composable in apps/pwa/src/composables/use[Entity].ts
□ Store created only if cross-view sharing is required
□ View uses composable — no inline fetch logic
□ i18n keys added to en.json under user.[entity].*
□ All layers use the SAME entity name
```

---
