# SPECS INDEX

Wszystkie specyfikacje w kolejności logicznych faz (od fundamentu do późniejszych etapów).  
Dla agenta: realizuj fazy od 1 wzwyż; wewnątrz fazy – według numeru SPEC.

---

## 1. Foundation & quality

- **SPEC-0010** – Stage 0 CI gates + quality baseline
- **SPEC-0034** – Environment Strategy (Dev - Staging - Prod)
- **SPEC-0036** – Security Baseline Hardening
- **SPEC-0035** – Performance Budget & Lighthouse CI
- **SPEC-0037** – OpenAPI Contract Generation
- **SPEC-0038** – Release & Version Governance
- **SPEC-0032** – Backup & Recovery Policy
- **SPEC-0033** – Immutable Audit Log
- **SPEC-0039** – Data Retention & Deletion Policy
- **SPEC-0040** – Deployment Portability (Cloud Agnostic)
- **SPEC-0041** – Basic views – app shell (admin, rep, portal, website)

## 2. Auth & identity

- **SPEC-0002** – Google Workspace OIDC (Rep Auth)
- **SPEC-0024** – HCP Portal Authentication (Magic Link)

## 3. Data & config

- **SPEC-0031** – Data Schema Canonical Model (Type-First)
- **SPEC-0011** – Tenant config resolution in BFF
- **SPEC-0021** – Admin Panel - Tenant Config Editor

## 4. Integrations (external)

- **SPEC-0003** – Notion Adapter + Cache Layer
- **SPEC-0014** – Google Maps deep link (native navigation)
- **SPEC-0018** – Make.com webhook bridge for automations

## 5. Core rep workflow

- **SPEC-0013** – Leads, HCP, HCO views (list+detail) with region scoping
- **SPEC-0015** – Meeting lifecycle (start-stop) + context binding
- **SPEC-0043** – Planner calendar view and events
- **SPEC-0004** – Offline Meeting Mode
- **SPEC-0017** – PDF caching & preload flow
- **SPEC-0016** – Offline sync UI (queue + retry)
- **SPEC-0005** – PDF Player + Slide Tracking
- **SPEC-0001** – Config-driven Post-Call Form (PCF)
- **SPEC-0022** – Dynamic Form Builder (PCF Builder)

## 6. Design & UX

- **SPEC-0012** – Design tokens + Vuetify theme adapter
- **SPEC-0042** – Rep app mobile first + zwijany sidebar (toggle na dole)

## 7. Cross-cutting (i18n, email, observability)

- **SPEC-0006** – i18n Pipeline (Real)
- **SPEC-0007** – Email Engine (Transactional)
- **SPEC-0008** – Event Logging + Sentry

## 8. AI & insights

- **SPEC-0019** – OpenRouter integration wrapper + model pinning
- **SPEC-0009** – Rep Copilot (AI Q&A)
- **SPEC-0020** – Monthly insights report from rep questions
- **SPEC-0029** – Presentation Engagement Scoring v2
- **SPEC-0030** – Self-Improvement Loop (AI Planning Engine)
- **SPEC-0028** – Release Governance & AI Guard

## 9. Portal & compliance

- **SPEC-0025** – HCP Portal - Document Access
- **SPEC-0026** – Consent Management Module

## 10. Scale & ops

- **SPEC-0023** – Feature Flags Engine
- **SPEC-0027** – Multi-Region Data Partitioning

---

## Szybki lookup (po numerze SPEC)

| SPEC     | Tytuł (skrót) |
|----------|----------------|
| 0001 | Config-driven PCF |
| 0002 | Google Workspace OIDC (Rep Auth) |
| 0003 | Notion Adapter + Cache |
| 0004 | Offline Meeting Mode |
| 0005 | PDF Player + Slide Tracking |
| 0006 | i18n Pipeline |
| 0007 | Email Engine |
| 0008 | Event Logging + Sentry |
| 0009 | Rep Copilot (AI Q&A) |
| 0010 | Stage 0 CI gates |
| 0011 | Tenant config resolution in BFF |
| 0012 | Design tokens + Vuetify |
| 0013 | Leads, HCP, HCO views |
| 0014 | Google Maps deep link |
| 0015 | Meeting lifecycle |
| 0016 | Offline sync UI |
| 0017 | PDF caching & preload |
| 0018 | Make.com webhook bridge |
| 0019 | OpenRouter + model pinning |
| 0020 | Monthly insights report |
| 0021 | Admin Panel - Tenant Config Editor |
| 0022 | Dynamic Form Builder (PCF Builder) |
| 0023 | Feature Flags Engine |
| 0024 | HCP Portal Auth (Magic Link) |
| 0025 | HCP Portal - Document Access |
| 0026 | Consent Management Module |
| 0027 | Multi-Region Data Partitioning |
| 0028 | Release Governance & AI Guard |
| 0029 | Presentation Engagement Scoring v2 |
| 0030 | Self-Improvement Loop (AI Planning) |
| 0031 | Data Schema Canonical Model |
| 0032 | Backup & Recovery Policy |
| 0033 | Immutable Audit Log |
| 0034 | Environment Strategy |
| 0035 | Performance Budget & Lighthouse CI |
| 0036 | Security Baseline Hardening |
| 0037 | OpenAPI Contract Generation |
| 0038 | Release & Version Governance |
| 0039 | Data Retention & Deletion Policy |
| 0040 | Deployment Portability |
| 0041 | Basic views – app shell (admin, rep, portal, website) |
| 0042 | Rep app mobile first + zwijany sidebar (toggle na dole) |
| 0043 | Planner calendar view and events |

---

## Uwagi

- **Fazy 1–3** to fundament (CI, auth, dane) – od tego sensownie zaczynać.
- **Fazy 4–7** to integracje i główny flow repa (meeting → PDF → PCF).
- **Faza 8** (AI) buduje na danych i kontekście z workflow.
- **Fazy 9–10** (portal HCP, consent, multi-region, feature flags) traktuj jako późniejsze etapy.
