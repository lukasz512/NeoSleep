# [NeoCRM] — Technical Architecture

> **Template source**: adapted from tattoo-spots-ai architecture doc (docs/marcin/architecture.md).
> This is the canonical format for NeoCRM architecture documentation.
> Live doc: `docs/architecture.md` (keep up to date after every ADR).

---

## Tech Stack

### Library and Tool Versions

| Layer | Technology | Version | Justification |
|-------|-----------|---------|---------------|
| **Backend runtime** | Node.js | 20 LTS | Stability, ESM, performance |
| **Backend framework** | NestJS / Swagger | 4.x | Lightweight, no DI magic |
| **Frontend PWA** | Vue | 3.5.x | Composition API, reactivity |
| **Frontend website** | Vue | 3.5.x | Same stack, separate app |
| **Language** | TypeScript | 5.6.x | Strict mode, no `any` |
| **DB driver** | pg | 8.x | No ORM — raw SQL, full control |
| **Database** | PostgreSQL | 15 | RLS, JSONB, schema-per-tenant |
| **State** | Pinia | 3.x | Lightweight, Vue-native |
| **UI library** | Vuetify | 3.12.x | Accessible, white-label ready |
| **i18n** | Vue i18n | 10.x | PL/EN/MX, composable API |
| **Build** | Vite | 7.x | Fast HMR, ESM |
| **Monorepo** | pnpm workspaces | 9.x | Shared packages, disk efficient |
| **Testing** | Vitest | 4.x | Unit + integration |
| **CI/CD** | GitHub Actions | — | PR checks, deploy pipelines |

---

## Monorepo Structure

```
neoCRM/
├── apps/
│   ├── api/           # vue.js backend (port 3000)
│   ├── web/           # Vue.js dashboard (port 3001)
│   └── client-pwa/    # vue.js PWA dla klientów (port 3002)
├── packages/
│   ├── shared/        # Wspólne typy TypeScript
│   ├── ui/            # Komponenty UI (shadcn/ui)
│   └── config/        # Wspólne konfiguracje ESLint/TS
├── infrastructure/    # Docker Compose, nginx, skrypty
├── docs/              # Dokumentacja (arch, specs, wiki)
├── tasks/             # todo.md, lessons.md
├── tests/
│   └── load/          # Scenariusze k6
└── .github/
    └── workflows/     # CI/CD pipelines
```

**Current state vs target:**

| Location today | Target | Status |
|---|---|---|
| `services/api/` | `apps/api/` | migration debt |
| `apps/app/` | `apps/client-pwa/` | migration debt |
| `apps/website/` | `apps/web/` | migration debt |
| `packages/@neo/api` | `packages/shared/` | rename |
| `platform/i18n/` | `platform/i18n/` | ✅ correct |
---

## Application Descriptions

### `apps/api` — Express BFF

| Attribute | Value |
|-----------|-------|
| Port | 3000 |
| Base URL | `/api/` |
| Auth | Session cookie (httpOnly), Google OIDC + password |
| Package | `@neo/api` |

**Purpose**: The only trust boundary. All auth, DB queries, and external integrations go through here. The frontend has zero secrets.

**Module pattern** — each domain is a vertical slice:

```
apps/api/src/
├── db/
│   ├── [entity].ts            # SQL functions for one entity (getEncounters, insertEncounter…)
│   ├── index.ts               # DB pool + withTenant()
│   └── migrations/            # Numbered .sql files, run on startup
├── routes/
│   └── [entity].ts            # Express router: auth middleware, validation, calls db/, writes audit log
├── auth.ts                    # requireAuth, requireRole middleware
└── server.ts                  # Express app bootstrap
```

**Request flow**:

```
HTTP Request
    ↓
cors, helmet, compression, cookie-parser
    ↓
requireAuth(req)               ← session check
    ↓
requireRole('rep' | 'admin')   ← RBAC
    ↓
Input validation               ← no raw req.body trust
    ↓
withTenant(slug, async () =>   ← sets search_path, all DB in transaction
    db/[entity].ts             ← parameterized SQL query
)
    ↓
audit_log write                ← mandatory for mutations on Art.9 data
    ↓
HTTP Response                  ← no stack traces, no internal field names
```

### `apps/client-pwa` — Vue 3 PWA (Rep App)

| Attribute | Value |
|-----------|-------|
| Port | 3001 (dev) |
| Package | `@neo/app` |
| Routing | Vue Router 4.5 |

**Purpose**: Pharma sales rep CRM. Mobile-first PWA. White-label — tenants change colors + logo only.

**Frontend patterns**:

| Pattern | Implementation |
|---------|---------------|
| Auth context | `authStore` (Pinia) |
| BFF calls | `useApi()` — the ONLY way to call the API |
| i18n | `useI18n()`, keys i18n/en.json` |
| Feature flags | `useAppConfig()` — driven by `app_config` table |
| Responsive | `useDisplay()` from Vuetify + `v-bind()` for CSS |

**Layer structure**:

```
apps/client-pwa/src/
├── views/           [Entity]View.vue           ← layout + slot assignment only
├── composables/     use[Entity].ts             ← loading, error, filter state
├── stores/          [entity]Store.ts           ← cross-view shared state only
├── components/      App[Name].vue              ← reusable UI components
├── assets/
│   ├── theme.scss                              ← style
└── router/          routes.ts
```

---

## Shared Packages

| Package | Description | Consumers |
|---------|-------------|-----------|
| `@neo/shared` | TypeScript types, enums, utils — shared between API and frontend | api, client-pwa, web |
| `@neo/ui` | Vuetify-based component library, Vuetify plugin setup | client-pwa |
| `@neo/stores` | Pinia stores shared across apps | client-pwa |

---

## Database — PostgreSQL

### Key Design Decisions

| Decision | Detail |
|----------|--------|
| Primary keys | UUID everywhere |
| Tenant isolation | Schema per tenant (`search_path` set by `withTenant()`) |
| Soft deletes | `deleted_at TIMESTAMPTZ` — no hard DELETE on user data |
| Audit columns | `created_at`, `updated_at` on all tables |
| GDPR Art.9 | `observation`, `consent`, `audit_log` — NEVER delete |
| Extensibility | `metadata JSONB DEFAULT '{}'` on all main entity tables |
| FHIR alignment | Table names map to FHIR R4 resources — see ADR-004 |

### Schema groups

| Group | Tables |
|-------|--------|
| Platform | `platform.companies`, `platform.tenants`, `platform.platform_users`, `platform.plans`, `platform.subscriptions`, `platform.feature_flags`, `platform.lookups` |
| Identity (TPT) | `identities`, `users`, `practitioner`, `patient`, `lead` |
| Clinical | `encounter`, `product`, `observation`, `communication`, `medication_request`, `consent` |
| Sales | `presentation`, `custom_deck`, `pcf_template` |
| Config | `app_config`, `lookup`, `audit_log`, `push_subscription`, `i18n_override` |
| Organization | `organization`, `address`, `territory` |

### Indexing strategy

```sql
-- Always: FK columns
CREATE INDEX idx_encounter_identity_id ON encounter(identity_id);

-- Partition pruning (encounter is partitioned by month)
-- Always filter by created_at to use partition pruning
SELECT * FROM encounter WHERE created_at >= '2026-01-01' AND tenant_id = $1;

-- JSONB querying
CREATE INDEX idx_identities_national_ids ON identities USING gin(national_ids);

-- Composite for common filters
CREATE INDEX idx_encounter_tenant_date ON encounter(created_at) -- partition handles tenant via schema
```

---

## Infrastructure and Deployment

### Production topology

```
Internet
    ↓
CDN (static assets)
    ↓
VPS / Cloud Server
    └── Docker Compose
        ├── Traefik       (80/443, SSL Let's Encrypt, routing)
        ├── api           (:3000) → api.neosleepcare.com
        ├── web           (:3001) → neosleepcare.com
        ├── client-pwa    (:3002) → app.neosleepcare.com
        └── postgres      (:5432)
```

### Docker services

| Service | Image | Notes |
|---------|-------|-------|
| `traefik` | traefik:v3 | Reverse proxy, SSL, routing |
| `api` | build: apps/api | Depends on postgres |
| `client-pwa` | build: apps/client-pwa | Depends on api |
| `website` | build: apps/website | Static or SSR |
| `postgres` | postgres:15-alpine | Volume: postgres_data |

### Environment variables (required)

| Category | Variables |
|----------|-----------|
| **Database** | `DATABASE_URL`, `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` |
| **Auth** | `SESSION_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` |
| **Email** | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` |
| **Push** | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` |
| **Frontend** | `VITE_API_URL`, `VITE_APP_URL` |

---

## CI/CD — GitHub Actions

| File | Trigger | Tasks |
|------|---------|-------|
| `ci.yml` | PR to any branch | Lint → typecheck → test → build |
| `deploy-app.yml` | Push to `dev` /`uat` / `prod` | Build → FTP deploy → health check |
| `deploy-web.yml` | Push to `dev` /`uat` / `prod` | Build → FTP deploy |
| `deploy-api.yml` | Push to `dev` /`uat` / `prod` | Build → deploy → restart |
| `promote-dev-to-uat.yml` | Manual | Merge dev → uat |
| `security.yml` | Weekly + push to main | npm audit, SAST scan |
| `rollback-api.yml` | Manual | Rollback API to previous version |

### Branch → Environment mapping

```
dev branch   → app-dev.neosleepcare.com / dev.neosleepcare.com
uat branch   → app-uat.neosleepcare.com / uat.neosleepcare.com
prod branch  → app.neosleepcare.com / neosleepcare.com
```

---

## Security

### Authentication

| Surface | Mechanism |
|---------|-----------|
| Reps / Managers / Admins | Google OIDC + email/password fallback |
| Session | httpOnly cookie, server-side session store |
| HCP Portal (planned) | Magic link (JWT in email, one-time) |
| Platform admin | `platform_users` table, separate auth flow |

### RBAC

| Role | Scope |
|------|-------|
| `admin` | Full tenant access |
| `manager` | Team + reports, no billing |
| `rep` | Own territory only |

Authorization is always enforced server-side. Frontend role checks are decoration only.

### Multi-tenant isolation

| Level | Mechanism |
|-------|-----------|
| DB | `withTenant(slug, fn)` sets `search_path TO "${slug}", platform, public` |
| Session | `tenant_slug` stored in session, never taken from request body |
| API | All routes use `withTenant()` — missing it is a red flag |
| GDPR | Schema-per-tenant = physical data isolation |

---

## Monitoring and Observability

| Tool | Use | Integration |
|------|-----|-------------|
| `platform.errors` table | Centralized error log for all tenants | `insertDiagnostic()` — uses root pool, not withTenant |
| Telegram | Operator alerts (errors, new leads, key events) | `services/telegram/` |
| Health endpoint | `/api/health` | Docker health check + CI |

---

*Document format based on tattoo-spots-ai architecture (docs/marcin/architecture.md, March 2026)*
*Keep this document up to date after every ADR. If something changed and this doc doesn't reflect it — update this first.*
