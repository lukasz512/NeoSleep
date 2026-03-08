# Neo Sleep Care – Foundation Pack

This pack is the **single source of truth** for architecture, modules, specs, and AI-assisted development.

## How to use
1) Put this folder in your repo under `/foundation/` (or merge into `/docs`).
2) Start every feature with a **SPEC** (`/specs`) and an **ADR** if it changes architecture.
3) Every PR must update:
   - docs (module docs + relevant specs)
   - tests (unit + e2e where relevant)
   - changelog entry

## Core apps (v1)
- `apps/rep-app` – Rep PWA (Vue 3 + TS + Vuetify)
- `apps/admin` – Admin (tenant config, PCF builder, feature flags)
- `apps/portal` – HCP/Patient portal (document access, magic link auth)
- `apps/website` – Marketing website
- `services/bff` – Backend For Frontend (BFF)

## Core principles
- White-label from day 1 via `tenant-config`
- EN is source-of-truth language
- i18n keys are extracted + pruned via CI
- Secrets never in frontend; BFF owns integrations
- Offline-first for meetings: content + PCF queue
- Medical data treated as sensitive (PHI-like) by default

Date: 2026-02-18
