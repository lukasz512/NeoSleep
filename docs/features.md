# NeoSleep — Feature Status Catalog

> Last updated: 2026-03-21
> Status assessed from: `apps/pwa/src/`, `apps/api/src/`, `packages/`

---

## Status legend

| Status | Definition |
|--------|------------|
| **Complete** | Backend + frontend + tests, works end-to-end |
| **Partial** | Part of the implementation exists (e.g. backend without frontend, or logic incomplete) |
| **Stub** | Directory/files exist but contain placeholder / TODO / non-working code |
| **Missing** | Mentioned or planned but no implementation yet |

---

## 1. Authentication & Session

| Feature | Status | Notes |
|---------|--------|-------|
| Email + password login | **Complete** | bcrypt, session cookie, rate limiting |
| Google OIDC | **Partial** | Code written in `auth.ts`, credentials not yet configured |
| Remember-me (30 days) | **Complete** | HMAC-signed cookie, `users.remember_me_version` |
| Password reset | **Complete** | Token via email, 1h expiry |
| Account lockout | **Missing** | No brute-force lockout after N failed attempts |
| 2FA / WebAuthn | **Missing** | Planned for Stage 3+ |
| Magic link (HCP) | **Missing** | Architecture decision pending — see OPEN QUESTION in CLAUDE.md |

---

## 2. Rep App — Shell & Navigation

| Feature | Status | Notes |
|---------|--------|-------|
| App shell with sidebar layout | **Complete** | `apps/pwa/src/layouts/` |
| Route guard (auth) | **Complete** | `router/` |
| Dark/light theme | **Complete** | Vuetify theme switching |
| i18n (EN, PL, ES) | **Complete** | `packages/i18n/` |
| PWA manifest | **Partial** | Vite PWA config present, not verified |
| Offline mode | **Missing** | No service worker caching strategy |

---

## 3. Leads (CRM)

| Feature | Status | Notes |
|---------|--------|-------|
| Lead list view | **Complete** | `LeadsView.vue` + `/api/leads` |
| Lead detail view | **Complete** | `LeadDetailView.vue` |
| Lead CRUD | **Complete** | Full REST: GET, POST, PUT, DELETE |
| Lead → HCP conversion | **Missing** | No workflow to promote a lead to HCP |

---

## 4. HCP Management

| Feature | Status | Notes |
|---------|--------|-------|
| HCP list view | **Complete** | `HCPView.vue` + `/api/hcp` |
| HCP detail view | **Complete** | `HCPDetailView.vue` |
| HCP CRUD | **Complete** | Full REST |
| HCP search / filtering | **Partial** | Backend supports query, frontend filter UI incomplete |
| HCP territory scoping | **Missing** | No region-based filtering per rep |

---

## 5. HCO Management

| Feature | Status | Notes |
|---------|--------|-------|
| HCO list view | **Complete** | `HCOView.vue` + `/api/hco` |
| HCO detail view | **Complete** | `HCODetailView.vue` |
| HCO CRUD | **Partial** | GET + detail only — no create/edit UI |
| HCO ↔ HCP relationship | **Partial** | Data model exists, UI not wired |

---

## 6. Visits & Events (PCF)

| Feature | Status | Notes |
|---------|--------|-------|
| Events list | **Partial** | `/api/events` exists, no dedicated view yet |
| Post Call Form (PCF) | **Missing** | Core Stage 2 feature — not started |
| Visit planner | **Partial** | `PlannerView.vue` exists — stub |
| PCF history per HCP | **Missing** | |

---

## 7. Presentations

| Feature | Status | Notes |
|---------|--------|-------|
| Presentations list | **Complete** | `PresentationsView.vue` + `/api/presentations` |
| Presentation detail | **Partial** | GET by ID in backend, no detail view in frontend |
| Upload / manage slides | **Missing** | |

---

## 8. Patients

| Feature | Status | Notes |
|---------|--------|-------|
| Patients list | **Complete** | `PatientsView.vue` + `/api/patients` |
| Patient CRUD | **Complete** | Full REST |
| Patient ↔ HCP link | **Partial** | DB supports it, no UI for linking |

---

## 9. Config & Tenant

| Feature | Status | Notes |
|---------|--------|-------|
| App config (per tenant) | **Complete** | `app_config`, `/api/config/app` |
| Config options (dropdowns) | **Complete** | `/api/config/options` |
| i18n config via API | **Complete** | `/api/config/i18n` |
| Multi-tenant isolation | **Missing** | No `tenant_id` in DB tables yet — single-tenant only |
| White-label | **Missing** | Planned post Stage 3 |

---

## 10. Infrastructure & DevOps

| Feature | Status | Notes |
|---------|--------|-------|
| Request ID middleware | **Complete** | `X-Request-ID` on every request |
| Rate limiting | **Complete** | `express-rate-limit` on all routes |
| Health check (`/health`) | **Complete** | Returns `{ ok: true }` |
| Security headers (Helmet) | **Missing** | No HSTS, CSP, X-Frame-Options |
| API versioning (`/api/v1/`) | **Missing** | Routes use `/api/` prefix only |
| Structured logging (Pino) | **Missing** | No structured JSON logs |
| Error monitoring (Sentry) | **Missing** | |
| Soft deletes (`deleted_at`) | **Missing** | Tables use hard DELETE |
| UUID primary keys | **Missing** | All tables use SERIAL (int) |
| Audit columns everywhere | **Partial** | `created_at` present, no `updated_by` |
| Rollback workflow (CI) | **Missing** | No rollback GitHub Action |
| Security scan workflow | **Missing** | No `npm audit` / SAST CI job |

---

## 11. Notifications

| Feature | Status | Notes |
|---------|--------|-------|
| Push notifications (Web Push) | **Complete** | `push_subscriptions`, `/api/push` |
| Email (Resend) | **Complete** | Password reset, partner invites, lead offers, demo booking, contact form (see ADR-016) |
| SMS | **Missing** | |
| In-app notifications | **Missing** | |

---

## 12. Diagnostics & Audit

| Feature | Status | Notes |
|---------|--------|-------|
| Diagnostics endpoint | **Complete** | `/api/diagnostics` — client error logging |
| Audit log (`audit_log`) | **Stub** | Table mentioned in CLAUDE.md, not used |
| Activity feed | **Missing** | |

---

## 13. Website & Marketing

| Feature | Status | Notes |
|---------|--------|-------|
| Marketing landing page | **Complete** | `apps/web/` |
| Contact form → API | **Complete** | `/api/contact` → Resend |
| SEO / sitemap | **Partial** | |

---

## Stage 2 targets (next)

- Post Call Form (PCF) — backend + frontend
- Real DB reads in all CRM views (remove any hardcoded data)
- HCP territory scoping per rep
- Audit log implementation
- Security headers + API versioning
