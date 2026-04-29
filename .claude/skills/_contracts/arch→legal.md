# Contract: arch → legal

> **What this file is**: A formal interface between the Software Architect skill and the Legal & Compliance skill.
> Arch delegates to legal when architectural decisions have regulatory implications.
> Legal returns structured compliance verdicts that arch can incorporate into ADRs and specs.
>
> **Sources behind this contract**:
> - GDPR Art.30 — "Records of processing activities" (data map obligation)
> - GDPR Art.25 — "Data protection by design and by default" (architect's primary GDPR duty)
> - LFPDPPP Art.16 (MX) — privacy notice obligation tied to data collection
> - HIPAA §164.308(a)(1) — risk analysis requirement before PHI is processed
> - HITRUST CSF v11 Control 07.a — information classification at the point of schema design

---

## When arch calls legal

Arch delegates to legal when:
- A new entity spec introduces a table that may hold personal data
- A new API endpoint collects or processes health-related data
- A feature affects consent, erasure, or data export (DSAR)
- A new country/tenant is being onboarded (new jurisdiction)
- An ADR has compliance implications that arch cannot fully assess alone
- A migration touches `consent`, `audit_log`, or `patient` tables

---

## INPUT FORMAT — arch → legal

```markdown
## Legal Task: [task type]

**Context**: [1-2 sentences — what feature/entity triggered this review]
**Priority**: [blocking | pre-UAT | advisory]
**Jurisdictions in scope**: [EU (GDPR) | MX (LFPDPPP) | US (HIPAA) | all]
**References**: [entity spec, ADR, or migration file]

### Task Type
[one of: data-map-review | new-table-assessment | consent-flow-review | erasure-impact | jurisdiction-onboarding | feature-compliance-check]

### Input Data

#### New Table Assessment (if task type = new-table-assessment)
Table: [name]
Schema: [platform | {tenant}]

Fields with potential personal data:
| Field | Data type | Example value | Personal? | Special category? |
|---|---|---|---|---|
| [field] | [TEXT/JSONB/etc] | [e.g. "jan.kowalski@gmail.com"] | [yes/no/unsure] | [yes/no/unsure] |

Intended use: [what this data is used for — the business purpose]
Who can access: [roles: rep | manager | admin | platform_user]
Retention intent: [how long should this data live]
Erasure behavior: [soft delete | anonymize | never delete — and why]

#### Consent Flow Review (if task type = consent-flow-review)
Feature: [what the user is consenting to]
Legal basis proposed: [Art.6(1)(a) consent | Art.6(1)(b) contract | Art.6(1)(c) legal obligation | Art.6(1)(f) legitimate interest]
Jurisdictions: [EU | MX | US]
Consent UI description: [how consent is collected — opt-in/opt-out, wording]
Withdrawal mechanism: [how user can withdraw]

#### Erasure Impact Assessment (if task type = erasure-impact)
Entity being erased: [practitioner | patient | lead | user]
Tables that hold their data: [list]
Tables where data must be retained despite erasure request: [audit_log, consent — per legal obligation]
Current erasure implementation: [soft delete | anonymize | hard delete]
```

---

## OUTPUT FORMAT — legal → arch

```markdown
## Legal Response: [task type]

**Verdict**: [CLEAR | REQUIRES CHANGE | REQUIRES DISCUSSION]
**Blocking on PROD**: [yes | no]

### Data Map Entries Required

Add the following to `docs/data-map.md`:

| Table | Field | Data Class | Legal Basis | Jurisdiction | Retention | Erasure Method |
|---|---|---|---|---|---|---|
| [table] | [field] | [personal | special-category | non-personal] | [Art.6(1)(x) / LFPDPPP Art.x / HIPAA] | [EU: 3y | MX: 5y | US: 6y] | [soft-delete | anonymize | retain] |

### Consent Requirements

[If new data collection: what consent language is needed, on which form, in which languages]

**Required consent record fields** (if applicable):
- `legal_basis`: [exact value to store]
- `purpose`: [exact value to store]
- Jurisdictions: [which consent table entries needed]

### Erasure Rules

| Table | Field | On Erasure Request | Reason |
|---|---|---|---|
| [table] | [field] | [nullify | hash | retain] | [legal obligation or purpose] |

### ARCO / DSAR Impact (MX tenants)

[If MX jurisdiction: what ARCO rights (Acceso, Rectificación, Cancelación, Oposición) this feature affects and how they must be handled]

### Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| [specific compliance risk] | [🔴 high / 🟡 medium / 🔵 low] | [what arch/dev must do] |

### Required Changes Before Proceeding

\`\`\`
□ [specific change 1]
□ [specific change 2]
\`\`\`

### ADR Impact

[Does this require an ADR? If yes: proposed ADR title and key decision to document]
```

---

## Escalation Rules

Legal escalates back to arch when:
- The data model makes a regulatory requirement technically impossible (requires redesign)
- A new jurisdiction has requirements that conflict with existing ADRs
- A "retain forever" requirement conflicts with a "soft delete" design (arch must resolve)

Legal does NOT make schema changes. Legal produces verdicts and requirements. Arch owns the implementation decision.

---

## Standing Rules (always apply, no need to ask)

These apply to every entity. Legal does not need to be consulted for these — arch enforces them directly:

| Rule | Source |
|---|---|
| `audit_log`: NEVER delete | GDPR Art.5(2), HIPAA §164.312(b) |
| `consent`: NEVER delete | GDPR Art.7(1) — consent record is proof of lawful processing |
| `observation` (PCF): NEVER delete | Clinical record integrity, HIPAA |
| `patient.diagnosis_code`: special category → encrypt at rest | GDPR Art.9 |
| `national_ids JSONB` (PESEL, SSN, cedula): special category → encrypt at rest | GDPR Art.9, LFPDPPP Art.16 |
| No personal data in URL params | GDPR — URLs end up in server logs |
| Retention periods: EU 3y, US 6y, MX 5y, TH 3y | Per jurisdiction health data law |
