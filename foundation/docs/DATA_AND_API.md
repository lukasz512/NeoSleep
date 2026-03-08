# Data, API, and validation

Short reference for where data lives, how frontends get it, and how to validate it. Complements ARCHITECTURE_BIBLE and SPEC-0031.

## Local database first

- Develop against **local PostgreSQL** (Docker or native); see **foundation/docs/LOCAL_DATABASE.md**.
- When ready for UAT/prod, point BFF at a hosted Postgres (Neon, Supabase) via `DATABASE_URL`; same schema and migrations. No need to host from day one.

## Users and roles (in your DB)

- **Auth** is delegated to a provider (e.g. Google OIDC, SPEC-0002). BFF validates tokens and maps identity to your **users** table.
- **Users table**: **tbl_users** (migration 004): id, email, name, role (admin | manager | rep), provider, provider_id, region. New users from Google get role **rep** by default. Session includes **user.role**.
- **Roles**: admin (full access), manager (team/region), rep (own/assigned data). BFF enforces on every request. See **foundation/docs/USERS_AND_ROLES.md** for current schema and permissions next steps; see AUTOMATION_AND_COMPLIANCE.md for compliance and data flow.

## API boundary: BFF only

- All frontends (rep, admin, portal, website if needed) call the **BFF** (`services/bff`). There is no direct DB or Notion access from the browser.
- BFF owns: auth, RBAC, tenant config, rate limits, logging, and redaction. See `foundation/modules/bff-service.md`.

## Database: own PostgreSQL

- Goal: move from Notion to **your own PostgreSQL** for full control and scalability.
- **Canonical model**: SPEC-0031 defines TypeScript domain types (Lead, HCP, HCO, Meeting, etc.). BFF and future DB layer use the same types; Notion adapter maps Notion → canonical, later a Postgres client maps DB → canonical.

### Hosting PostgreSQL

Options (all work with BFF over the network):

| Option | Notes |
|-------|--------|
| **Neon** | Serverless Postgres, free tier, easy for dev/staging. |
| **Supabase** | Postgres + optional REST/auth; use as DB only or full backend. |
| **Railway / Render** | Simple hosted Postgres + run BFF on same provider. |
| **Google Cloud SQL** | Good if you standardize on GCP; more setup. |

Recommendation: start with **Neon** or **Supabase** for dev/staging; same BFF code can point to different `DATABASE_URL` per environment. No need to host DB “in” Make.com; Make calls your BFF or webhooks, BFF talks to Postgres.

### How frontends get data

- Frontend (Vue) → HTTP to BFF (e.g. `GET /api/leads`, `POST /api/pcf`) → BFF → PostgreSQL (or Notion adapter during transition). So “API” for the frontends **is** the BFF.

### Leads API (server-side pagination and filters)

- **GET /api/leads** returns a **paginated, filterable** list. **Filtering and sorting are done server-side** (BFF/DB): the frontend sends query params and receives only the matching page of results. Query params: `page` (1-based), `limit` (1–100, default 10), `sortBy` (name | email | status | region | created_at), `sortOrder` (asc | desc), `search` (substring on name, email, status, region), `status`, `region` (exact match). Response: `{ items: Lead[], total: number }`. The rep-app Leads view uses this API; filters (RepFilterBar) and search are sent as params and the table never loads the full set into the client. BFF tests (server.spec.ts) assert that status, region, and search filters are applied server-side.

## Validations

- **BFF**: Validate all inputs and env with **Zod** (or similar). Validate responses against canonical schemas before sending. This is the source of truth for “allowed shape” of data.
- **Frontend**: Use **Vuetify** form rules (e.g. `rules` on `v-text-field`) and/or **VeeValidate** for UX. Keep rules aligned with BFF contracts (e.g. share Zod schema or generate types from OpenAPI later – SPEC-0037). Never trust frontend-only validation for security; BFF must re-validate.

## Automation (Make.com)

- Make.com runs flows (webhooks, schedules). It can call your BFF HTTP endpoints or dedicated webhook routes. BFF can talk to Postgres; Make does not need to host the DB. Use Make for: i18n auto-translate PRs, email triggers, sync jobs, etc. (SPEC-0018).

## Vendor lock-in

**Vendor lock-in** means your app and data depend heavily on one provider (e.g. Notion, Firebase). Changing provider later is costly: different API, data model, and often a full migration. **PostgreSQL** is an open standard; you can move from Neon to Cloud SQL to self-hosted with the same schema and SQL. **Notion/Firebase** tie you to their product and pricing. For a long-term app with HCP/HCO, users, and compliance, **Postgres + BFF** gives more control and portability.

## Audit log (operational, not “security audit”)

- **Audit log** here = “who did what, when” (e.g. user X viewed lead Y, user Z exported a list). Used for **operational compliance** and support, not for a one-off **security audit** by an external firm. You store audit events in your DB (e.g. `audit_events` table); BFF writes on sensitive actions. A **security audit** (pentest, certification) is a separate activity; the audit log is one input they might use.

## Postgres vs Notion: what’s faster to start, what’s less work long term

| | Notion | Postgres + BFF |
|--|--------|----------------|
| **Start fast** | Very fast: create DB in Notion, use API or Make to read/write. | A bit more setup: local Postgres (Docker), BFF connection, migrations. |
| **Control & automation** | Notion API and Make are flexible but you adapt to Notion’s model and limits. | Full control: SQL, migrations, Make (or cron) calls BFF → BFF talks to Postgres. Easy to automate (Make → BFF → DB). |
| **Long-term** | Becomes a bottleneck for scale, roles, and compliance; migration off is painful. | One place for users, HCP/HCO, audit; same stack for all apps; “close to Google” = use **Cloud SQL** on GCP if you want docs/DB in one cloud. |

**Recommendation:** Use **Postgres** (local first, then e.g. **Google Cloud SQL** so it’s “blisko dokumentów z Google”) and **Make** only to call your **BFF** (or webhooks). BFF connects to Postgres; automations in Make stay simple (HTTP calls). That’s less work long term than wiring everything to Notion and later migrating. For “ruszyć z projektem” quickly: keep BFF + Postgres from the start, use a single `docker-compose` Postgres and a few BFF routes; add Make when you need automation.

## Summary

- **API** = BFF only; frontends only call BFF.
- **Database** = Start with **local PostgreSQL** (see LOCAL_DATABASE.md); later Neon/Supabase/Railway; BFF connects via `DATABASE_URL`.
- **Users/roles** = Stored in your DB; auth via provider (e.g. Google OIDC); BFF enforces role and region.
- **Validations** = Zod on BFF; Vuetify/VeeValidate on frontend; keep in sync.
- **Make.com** = Optional; calls BFF/webhooks; does not host DB.
