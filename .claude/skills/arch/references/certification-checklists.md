# Certification Readiness Checklists

Run the relevant checklist before any release that touches data, auth, or patient-facing flows.
**Fail = block release. Partial = document the gap in an ADR before proceeding.**

---

## GDPR (EU — all tenants)

```
Data collection
□ Every personal data field is in the compliance data map
□ Art.9 fields (diagnosis, consent, audit_log) have NO deleted_at — physically retained
□ National IDs (PESEL, SSN, cedula) are encrypted at rest
□ Retention policy is set per jurisdiction: EU 3y, US 6y, MX 5y, TH 3y

Consent
□ consent table records: legal_basis, purpose, granted_at, revoked_at
□ Consent collected before any Art.9 data is stored
□ UI: consent is opt-in (no pre-ticked checkboxes)
□ Consent withdrawal removes access but NOT the record (immutable consent log)

Access controls
□ withTenant() wraps every DB query — no cross-tenant reads possible
□ tenant_slug comes from session, never from request body
□ audit_log entry written for every mutation of Art.9 data
□ Data export (DSAR) path exists or is explicitly deferred with timeline

Architecture
□ Schema-per-tenant = physical isolation (no shared tenant_id column)
□ platform.errors does NOT log personal data in error messages
□ No personal data in URL params or query strings (use POST body)
□ API error responses contain no internal field names or stack traces
```

---

## HIPAA (US market — neosleep_us tenant)

```
□ PHI fields identified: identities (name, email, phone), patient (diagnosis, medical_record)
□ PHI encrypted at rest (column-level or disk-level encryption documented)
□ PHI encrypted in transit (TLS 1.2+ enforced on all routes)
□ Audit log covers: who accessed PHI, when, from what IP
□ Minimum necessary principle: API returns only fields needed for the use case
□ No PHI in logs (platform.errors, server logs, CI/CD output)
□ BAA (Business Associate Agreement) in place with GoDaddy/VPS provider
□ Incident response plan documented: breach notification within 60 days
□ User session timeout configured (idle session auto-logout)
□ Role-based access: rep cannot read another rep's patient data
```

---

## LFPDPPP (Mexico — neosleep_mx tenant)

```
□ Privacy Notice (Aviso de Privacidad) accessible from every data collection form
□ consent table: records LFPDPPP purpose (salud, investigación, comercial)
□ Data localization: MX patient data stored in MX or US (no EU-only servers)
□ ARCO rights path exists: Acceso, Rectificación, Cancelación, Oposición
□ Sensitive data (datos sensibles): health data requires explicit written consent
□ Retention: health data retained 5 years, then anonymized
□ Data transfer to third parties: logged and covered by privacy notice
```

---

## HONcode (Medical Website — apps/website)

```
Content
□ All medical information attributed to a qualified author or source
□ No claims that replace professional medical advice (add disclaimer where needed)
□ Date of last content update visible on all medical content pages
□ Contact information (email or form) accessible from every page

Transparency
□ Privacy policy accessible from footer — covers data collection and purpose
□ Advertising/sponsorship clearly labeled if present
□ No sponsored content presented as editorial content

Patient safety
□ Website does not collect health data without explicit consent flow
□ Contact form: no medical diagnosis via form — redirect to specialist
□ Emergency / crisis content links to national hotlines (if applicable)
```

---

## SOC 2 Type II — Architectural Prerequisites

```
Security (CC6 — Logical and Physical Access)
□ RBAC enforced server-side (not frontend-only)
□ Session tokens: httpOnly, Secure, SameSite=Strict
□ Password storage: bcrypt ≥12 rounds
□ No hardcoded credentials in code or environment files committed to git
□ Principle of least privilege: reps cannot access admin routes

Availability (A1)
□ Health endpoint exists: /api/health
□ Docker health check configured for all services
□ Rollback workflow documented and tested (rollback-bff.yml)

Confidentiality (C1)
□ TLS enforced on all services (Traefik handles termination)
□ Database not exposed to public internet (internal Docker network only)
□ Secrets in environment variables, never in source code

Processing Integrity (PI1)
□ Input validation on all API endpoints (no raw req.body trust)
□ Idempotency keys on financial/critical mutations
□ Audit log captures: user, action, entity_id, before/after, timestamp

Change Management
□ All schema changes via numbered migration files (no direct ALTER in prod)
□ CI gate: lint + typecheck + tests must pass before merge
□ git tags mark every production deploy (git tag v<version>)
```

---

## Pre-Release Architecture Gate

Run this before every release to UAT or PROD:

```
□ All new tables passed New Table Checklist
□ All new API routes passed New API Endpoint Checklist
□ Relevant certification tests above: PASS or gap documented in ADR
□ No TODO/FIXME comments in production-path code
□ No console.log with personal data
□ pnpm audit: zero critical vulnerabilities
□ Security workflow (security.yml) green
□ Health endpoint returns 200 after deploy
```
