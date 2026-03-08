# Architecture Diagram – Neo Sleep Care Platform

Last updated: 2026-02-18

## System overview

```
                    ┌──────────────────────────────┐
                    │        Website (Nuxt)         │
                    │   neosleepcare.com (SEO)      │
                    └──────────────┬───────────────┘
                                   │
                                   │ public links / redirects
                                   ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                                Frontends                                   │
│                                                                            │
│  ┌──────────────────────┐   ┌──────────────────────┐   ┌─────────────────┐│
│  │  Rep App (PWA)        │   │  Admin App           │   │  Client Portal   ││
│  │  app.neosleepcare.com │   │  admin... (later)    │   │  client... later ││
│  │  Google Workspace OIDC│   │  Admin RBAC          │   │  Magic Link auth ││
│  └───────────┬──────────┘   └───────────┬──────────┘   └─────────┬───────┘│
│              │                          │                          │        │
└──────────────┼──────────────────────────┼──────────────────────────┼────────┘
               │                          │                          │
               ▼                          ▼                          ▼
        ┌────────────────────────────────────────────────────────────────┐
        │                     BFF (Backend For Frontend)                 │
        │                        services/bff                            │
        │  - Auth (OIDC / magic link)                                    │
        │  - RBAC + region scoping (server-side enforced)                │
        │  - Tenant config resolution + caching                          │
        │  - Notion adapter (CRUD + rate-limit handling)                 │
        │  - Event ingestion + redaction + audit log                      │
        │  - OpenRouter AI wrapper (prompt/model pinning)                │
        │  - Email engine (provider + MJML templates)                    │
        └───────────────┬───────────────┬───────────────┬──────────────┘
                        │               │               │
                        │               │               │
                        ▼               ▼               ▼
            ┌────────────────┐  ┌────────────────┐  ┌──────────────────┐
            │ Notion (v1 DB) │  │ Make.com       │  │ OpenRouter (AI)   │
            │ Leads/HCP/HCO  │  │ Webhooks       │  │ Models router     │
            └────────────────┘  └────────────────┘  └──────────────────┘
                        │
                        ▼
            ┌────────────────────────────────┐
            │ Future DB (Postgres/Directus)  │
            │ Swap behind BFF, keep types    │
            └────────────────────────────────┘
```

## Trust boundaries (must stay true)

- **Frontends are untrusted**:
  - No secrets in apps.
  - No direct calls to Notion/OpenRouter/Make/email provider.
- **BFF is the integration boundary**:
  - Owns secrets, auth, and permission checks.
  - Performs redaction before logging.
- **Portal is separate from Rep app**:
  - Different auth model + risk profile.
  - Shared design tokens only.

## Data flow (meeting)

1) Rep selects Lead/HCP/HCO → starts meeting  
2) Rep shows PDF content (offline-capable)  
3) Rep fills PCF (config-driven)  
4) Events (slide tracking, meeting lifecycle) are queued if offline  
5) When online: BFF receives events + PCF, writes to DB (Notion v1), triggers Make automations, logs audit-safe records

## Multi-tenancy model

- Tenant resolved from **host/subdomain** in BFF.
- Tenant-config versioned:
  - branding (colors/logo)
  - features (flags)
  - PCF schema
  - i18n settings (default locale, enabled locales)
  - email templates
  - AI prompt/model registry

## i18n model

- EN is source-of-truth.
- CI pipeline:
  - extract keys → update `en.json`
  - detect unused → mark `unusedSince`
  - prune after safety window
  - auto-translate new keys via Make + OpenRouter → PR

## Security notes (v1)

- RBAC + region scoping in BFF on every endpoint.
- Sensitive data treated as PHI-like:
  - avoid logging free text / transcripts
  - audit log is append-only

## Deployment separation

- Separate deploys per app:
  - website / rep / admin / portal
- Separate deploy per env:
  - dev / staging / prod
- BFF deploy is shared but env-specific.

## References

- Architecture Bible: `/foundation/docs/ARCHITECTURE_BIBLE.md`
- Execution Map: `/foundation/docs/EXECUTION_MAP.md`
- Project State: `/foundation/docs/PROJECT_STATE.md`
- AI Playbook: `/foundation/docs/AI_PLAYBOOK.md`
- ADRs: `/foundation/adrs/`
- Specs: `/foundation/specs/`
