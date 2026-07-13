# ADR-009: FHIR R4 Compliance Scope — Progressive Approach

## Status
Accepted

## Date
2026-03-23

## Authors
Łukasz (Architect)

## Context

NeoCRM/NeoSleep is a medical-grade pharma CRM operating in healthcare data territories (Poland — GDPR, Mexico — LFPDPPP, US expansion planned). Interoperability with Electronic Health Record systems (Epic, Cerner, Mediktor) is on the 12–24 month roadmap. Compliance with FHIR R4 (HL7 Fast Healthcare Interoperability Resources) is increasingly required by:

- Enterprise pharma clients that integrate with hospital EHR systems
- HIPAA Business Associates who require standard data exchange formats
- Award bodies and certification programs (HIMSS Davies Award, KLAS)
- Data portability obligations under GDPR Art.20

**Baseline assessment (March 2026):**

| FHIR Compliance Domain | Current State | Score |
|---|---|---|
| Data model alignment | Tables mirror FHIR R4 resource shapes | ~65% |
| API layer (REST + content types) | No `/fhir/r4/` routes, no `application/fhir+json` | ~0% |
| Identifier format | Flat JSONB `{ "npi": "..." }` not FHIR Identifier[] | ~25% |
| Terminology (CodeableConcept) | Plain TEXT codes, no system URIs | ~15% |
| Security (SMART on FHIR) | Session auth, no OAuth2 SMART scopes | ~30% |
| **Overall estimated** | | **~35%** |

The schema was designed FHIR-inspired from the start (ADR-004: TPT identity model, ADR-006: `encounter` resource naming), but the API layer, identifier format, and terminology bindings were deferred. This ADR formalizes the scope and phasing.

---

## Decision

Adopt a **three-phase progressive FHIR compliance approach** — each phase delivers standalone value and passes an incremental audit checkpoint:

### Phase 1 — Foundation (target: ~58%) — implement today

Three additive changes, no breaking API changes:

1. **CapabilityStatement** — `GET /fhir/r4/metadata`
   - Static JSON route, zero DB calls
   - Declares only what is actually implemented (lying = audit fail)
   - First thing every FHIR auditor checks; without it: automatic fail in 5 minutes

2. **OperationOutcome error format** — dual-format error middleware
   - FHIR clients (`Accept: application/fhir+json`) receive FHIR OperationOutcome
   - Existing clients receive `{ error: { code, message, hint } }` — no breaking change
   - One middleware change in `apps/api/src/middleware/errorHandler.ts`

3. **FHIR Identifier[]** — `national_ids` migration
   - From: `{ "npi": "1234567890", "pwz": "..." }` flat JSONB
   - To: `[{ system: "http://hl7.org/fhir/sid/us-npi", value, use }]` array of Identifier
   - Constants in `packages/shared/src/types/identifier.ts` — no magic strings anywhere
   - One-time SQL migration, helper functions in same file
   - Required for EHR import/export (Epic, Cerner) and GDPR Art.20 data portability

**Phase 1 target: ~58% overall compliance.**

---

### Phase 2 — REST API Layer (target: ~72%) — 2–3 months

Expose FHIR R4 REST endpoints alongside existing API. Additive — existing routes unchanged.

Key endpoints to implement:
- `GET /fhir/r4/Practitioner`, `GET /fhir/r4/Practitioner/:id` — map from `practitioner` + `identities`
- `GET /fhir/r4/Organization`, `GET /fhir/r4/Organization/:id` — map from `organization`
- `GET /fhir/r4/Patient`, `GET /fhir/r4/Patient/:id` — map from `patient` + `identities`
- `GET /fhir/r4/Encounter`, `GET /fhir/r4/Encounter/:id` — map from `encounter`
- `GET /fhir/r4/Consent`, `GET /fhir/r4/Consent/:id` — map from `consent`
- `GET /fhir/r4/AuditEvent` — map from `audit_log`

Content negotiation: `Content-Type: application/fhir+json` on all FHIR routes.
Update CapabilityStatement to reflect newly exposed resources.

---

### Phase 3 — SMART on FHIR + Terminology (target: ~85%) — 6–12 months

- **SMART on FHIR** — OAuth2 authorization layer with `launch/patient`, `patient/*.read` scopes
  - Required for EHR integration (Epic App Orchard requires SMART launch)
  - Does NOT replace session auth — parallel auth path for FHIR clients
- **CodeableConcept terminology** — bind `encounter.type`, `consent.purpose` to standard ValueSets (SNOMED, LOINC, ICD-10)
- **FHIR Bulk Data Access** (`$export`) — for large data transfers and GDPR Art.20 machine-readable export
- **FHIR Subscription** — real-time notifications for connected EHR systems

**Phase 3 target: ~85% compliance. Sufficient for HIMSS Davies Award consideration and Epic App Orchard submission.**

---

## Consequences

**Enables:**
- Epic App Orchard submission (requires CapabilityStatement + SMART on FHIR)
- Enterprise pharma sales (large accounts require FHIR interoperability attestation)
- GDPR Art.20 compliance (data portability in machine-readable standard format)
- HIMSS Davies Award eligibility (healthcare IT award for interoperable systems)
- Veeva/IQVIA integration path (both use FHIR for data exchange)

**Closes:**
- Nothing — FHIR compliance is additive. Existing non-FHIR API remains unchanged.

**Technical debt addressed:**
- `national_ids` migration is a one-time cost with no ongoing maintenance overhead
- CapabilityStatement must be kept in sync with actually implemented endpoints

**Technical debt created:**
- Two auth paths in Phase 3 (session + SMART on FHIR) — need clear documentation on which clients use which
- CapabilityStatement lying (claiming resources not implemented) = automatic audit fail — CI check required

---

## Compliance Impact

| Regulation | FHIR Phase | Impact |
|---|---|---|
| GDPR Art.20 (data portability) | Phase 1–2 | FHIR Identifier[] + REST API satisfies machine-readable portability |
| LFPDPPP Art.13 (MX data access) | Phase 1–2 | Standard format enables automated DSAR responses |
| HIPAA §164.312(e) (transmission security) | Phase 3 | SMART on FHIR adds OAuth2 for EHR-to-EHR transmission |
| 21st Century Cures Act (US) | Phase 2–3 | Requires FHIR R4 API for US market entry |
| MDR/SaMD (EU Medical Device) | Phase 2 | FHIR data exchange required if classified as SaMD |

---

## References

- HL7 FHIR R4 specification: https://hl7.org/fhir/R4/
- SMART on FHIR: https://smarthealthit.org/smart-on-fhir/
- Epic App Orchard requirements: https://fhir.epic.com/
- HIMSS Davies Award: https://www.himss.org/davies-award
- Implementation notes: `.claude/skills/arch/assets/examples/good-fhir-api.md`
- Schema alignment: `.claude/skills/arch/assets/examples/good-fhir-alignment.md`
- Living compliance tracker: `docs/fhir-compliance.md`
