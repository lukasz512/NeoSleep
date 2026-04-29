# FHIR R4 Compliance Tracker

> Living document — update when a new endpoint, migration, or binding is added.
> Owner: Architect. Review before each major release.
> ADR: [ADR-009](ADR-009-fhir-compliance-scope.md)

---

## Overall Score

| Phase | Target | Current Status |
|---|---|---|
| Phase 1 — Foundation | ~58% | 🔶 In progress |
| Phase 2 — REST API Layer | ~72% | ⬜ Not started |
| Phase 3 — SMART + Terminology | ~85% | ⬜ Not started |
| **Baseline (pre-Phase 1)** | — | **~35%** |

---

## Phase 1 — Foundation Checklist

### 1.1 CapabilityStatement `GET /fhir/r4/metadata`

| Item | Status | File |
|---|---|---|
| Route exists | ⬜ | `apps/api/src/routes/fhir.ts` |
| Returns `resourceType: CapabilityStatement` | ⬜ | — |
| `Content-Type: application/fhir+json` header | ⬜ | — |
| Only declares actually-implemented resources | ⬜ | — |
| Updated when new FHIR endpoint added | ⬜ | — |

> Pattern: `.claude/skills/arch/assets/examples/good-fhir-api.md` §1

---

### 1.2 OperationOutcome Error Format

| Item | Status | File |
|---|---|---|
| Dual-format error middleware | ⬜ | `services/api/src/middleware/errorHandler.ts` |
| FHIR clients get `OperationOutcome` | ⬜ | — |
| Non-FHIR clients get `{ error: { code, message } }` | ⬜ | — |
| Checked via `Accept: application/fhir+json` header | ⬜ | — |
| `ErrorCode → FHIR severity/code` mapping complete | ⬜ | — |

> Pattern: `.claude/skills/arch/assets/examples/good-fhir-api.md` §2

---

### 1.3 FHIR Identifier[] Migration

| Item | Status | File |
|---|---|---|
| `FhirIdentifier` type defined | ⬜ | `packages/shared/src/types/identifier.ts` |
| `IDENTIFIER_SYSTEMS` constants (NPI, PWZ, PESEL, CEDULA, RFC) | ⬜ | `packages/shared/src/types/identifier.ts` |
| `Identifier.find()` helper | ⬜ | `packages/shared/src/types/identifier.ts` |
| `Identifier.set()` helper | ⬜ | `packages/shared/src/types/identifier.ts` |
| SQL migration: JSONB object → JSONB array | ⬜ | `services/api/migrations/004_fhir_identifiers.sql` |
| DB functions updated to use `Identifier.find/set` | ⬜ | `services/api/src/db/practitioner.ts`, `patient.ts`, `lead.ts` |
| `pg_dump` backup taken before migration | ⬜ | — |

> Pattern: `.claude/skills/arch/assets/examples/good-fhir-api.md` §3

---

## Phase 2 — FHIR REST Endpoints

### Resource: Practitioner (maps from `practitioner` + `identities`)

| Endpoint | Status | Notes |
|---|---|---|
| `GET /fhir/r4/Practitioner` | ⬜ | Returns Bundle of Practitioner resources |
| `GET /fhir/r4/Practitioner/:id` | ⬜ | Single resource |
| `GET /fhir/r4/Practitioner?name=` | ⬜ | Search by name |
| `GET /fhir/r4/Practitioner?identifier=` | ⬜ | Search by NPI/PWZ |
| Declared in CapabilityStatement | ⬜ | — |

---

### Resource: Organization (maps from `organization`)

| Endpoint | Status | Notes |
|---|---|---|
| `GET /fhir/r4/Organization` | ⬜ | — |
| `GET /fhir/r4/Organization/:id` | ⬜ | — |
| Declared in CapabilityStatement | ⬜ | — |

---

### Resource: Patient (maps from `patient` + `identities`)

| Endpoint | Status | Notes |
|---|---|---|
| `GET /fhir/r4/Patient` | ⬜ | GDPR: requires explicit consent check |
| `GET /fhir/r4/Patient/:id` | ⬜ | — |
| Erased patients return `[Removed]` / 404 | ⬜ | `erased_at IS NOT NULL` guard |
| Declared in CapabilityStatement | ⬜ | — |

---

### Resource: Encounter (maps from `encounter`)

| Endpoint | Status | Notes |
|---|---|---|
| `GET /fhir/r4/Encounter` | ⬜ | Always filter by `created_at` for partition pruning |
| `GET /fhir/r4/Encounter/:id` | ⬜ | — |
| `GET /fhir/r4/Encounter?subject=Patient/:id` | ⬜ | — |
| Declared in CapabilityStatement | ⬜ | — |

---

### Resource: Consent (maps from `consent`)

| Endpoint | Status | Notes |
|---|---|---|
| `GET /fhir/r4/Consent/:id` | ⬜ | — |
| Never deleted — GDPR retention | ⬜ | — |
| Declared in CapabilityStatement | ⬜ | — |

---

### Resource: AuditEvent (maps from `audit_log`)

| Endpoint | Status | Notes |
|---|---|---|
| `GET /fhir/r4/AuditEvent` | ⬜ | Admin only — scope by tenant |
| `retain_until` respected in query | ⬜ | — |
| Declared in CapabilityStatement | ⬜ | — |

---

### Resource: MedicationRequest (maps from `medication_request`)

| Endpoint | Status | Notes |
|---|---|---|
| `GET /fhir/r4/MedicationRequest/:id` | ⬜ | — |
| `encounter_id FK` present | ⬜ | Links to FHIR Encounter — required for full resource |
| Declared in CapabilityStatement | ⬜ | — |

---

## Phase 3 — SMART on FHIR + Terminology

### SMART on FHIR

| Item | Status | Notes |
|---|---|---|
| OAuth2 authorization server | ⬜ | Parallel to session auth |
| `launch/patient` scope | ⬜ | EHR launch context |
| `patient/*.read` scope | ⬜ | Read-only access |
| `openid fhirUser` claim | ⬜ | Identity propagation |
| Declared in CapabilityStatement `.security` | ⬜ | — |

---

### Terminology Bindings

| Field | Current | FHIR Target | Status |
|---|---|---|---|
| `encounter.type` | `'f2f' \| 'call' \| ...` from lookup | `v3-ActCode` ValueSet (AMB, VR, PHONE) | ⬜ |
| `consent.provision_purpose` | `['treat','marketing',...]` | FHIR `v3-ActReason` ValueSet | ⬜ |
| `practitioner.specialty` | Free text | SNOMED CT specialty codes | ⬜ |
| `medication_request.medication` | Product name + code | RxNorm (US) / ATC (EU) | ⬜ |

---

## FHIR Resource Shape Map

Current DB-to-FHIR mapping. Every resource must either have a table or a documented deviation.

| FHIR R4 Resource | DB Table | Coverage | Gap |
|---|---|---|---|
| `Person` | `identities` | Base shape ✅ | No FHIR REST endpoint |
| `Practitioner` | `practitioner` | Fields aligned ✅ | Identifier[] pending |
| `Organization` | `organization` | Fields aligned ✅ | No FHIR REST endpoint |
| `Patient` | `patient` | Fields aligned ✅ | Identifier[] pending |
| `RelatedPerson` | — | ❌ Not implemented | ADR required if needed |
| `PractitionerRole` | `hcp_role` | Partial ⚠️ | `location_id`, `period` fields to add |
| `Location` | `location` | Partial ⚠️ |  |
| `Encounter` | `encounter` | Shape aligned ✅ | No FHIR REST endpoint |
| `Observation` | `observation` | Shape aligned ✅ | `pcf_template_id` FK — non-standard extension |
| `Consent` | `consent` | Shape aligned ✅ | `provision_purpose[]`, `proof JSONB` added |
| `Communication` | `communication` | Shape aligned ✅ | — |
| `MedicationRequest` | `medication_request` | Partial ⚠️ | `encounter_id` FK to add |
| `AuditEvent` | `audit_log` | Fields aligned ✅ | No FHIR REST endpoint |
| `Address` | `address` | FHIR datatype ✅ | — |
| `Identifier` | `national_ids JSONB` | Object format ⚠️ | Migration to Identifier[] pending |
| `EpisodeOfCare` | `lead` | Custom extension ⚠️ | ADR: closest match, no direct resource |

---

## Red Flags (CI must catch)

- ❌ CapabilityStatement declares a resource whose endpoint returns 404
- ❌ `national_ids` written as flat object after Phase 1 migration
- ❌ `IDENTIFIER_SYSTEMS` constant defined outside `packages/shared/src/types/identifier.ts`
- ❌ FHIR error format returned to non-FHIR clients (check `Accept` header)
- ❌ New FHIR endpoint added without updating CapabilityStatement

---

## Related Files

| File | Purpose |
|---|---|
| `docs/ADR-009-fhir-compliance-scope.md` | Decision record for this approach |
| `.claude/skills/arch/assets/examples/good-fhir-api.md` | Phase 1 implementation patterns |
| `.claude/skills/arch/assets/examples/good-fhir-alignment.md` | Full schema-to-FHIR resource map |
| `services/api/src/routes/fhir.ts` | CapabilityStatement route (to create) |
| `packages/shared/src/types/identifier.ts` | FHIR Identifier type + constants (to create) |
| `services/api/migrations/004_fhir_identifiers.sql` | `national_ids` migration (to create) |
