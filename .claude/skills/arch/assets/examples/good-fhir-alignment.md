# Pattern: FHIR R4 Alignment

> Entity names, table shapes, and type codes follow FHIR R4 where a resource exists.
> Where FHIR has no resource (lead), extend `person` via TPT and document the deviation in an ADR.

---

## Alignment Map

| Table | FHIR R4 Resource | Notes |
|---|---|---|
| `person` | `Person` | TPT base — all persons extend this via `person_id FK UNIQUE` |
| `hcp` | `Practitioner` | extends person |
| `hco` | `Organization` | no person, owns address |
| `patient` | `Patient` | extends person |
| `related_person` | `RelatedPerson` | caregiver / next-of-kin / HCO contact — extends person |
| `lead` | — | ⚠️ custom — ADR required. Closest: Person + EpisodeOfCare |
| `location` | `Location` | replaces `territory` — hierarchy via `part_of_id` |
| `hcp_role` | `PractitionerRole` | who promotes what product, where, when |
| `encounter` | `Encounter` | partitioned by month |
| `observation` | `Observation` | filled PCF — never delete |
| `consent` | `Consent` | GDPR/LFPDPPP legal basis |
| `communication` | `Communication` | notes on any entity — never delete |
| `medication_request` | `MedicationRequest` | product prescribed to patient |
| `audit_log` | `AuditEvent` | compliance trail — retain_until per jurisdiction |
| `address` | `Address` datatype | shared by hco, patient, lead, location |

---

## 1. `location` — FHIR R4 Location (replaces `territory`)

One table for all geographic and physical places. `type` discriminates — no separate tables for venues, sites, regions.

```sql
CREATE TABLE location (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  part_of_id  UUID REFERENCES location(id),         -- hierarchy: region → district → city
  type        TEXT NOT NULL,                          -- 'TERRITORY'|'AREA'|'SITE'|'ROOM'|'CONF'
  name        TEXT NOT NULL,
  code        TEXT,                                   -- nullable — no UNIQUE (Veeva/IQVIA import safe)
  status      TEXT NOT NULL DEFAULT 'active',         -- FHIR: active | suspended | inactive
  address_id  UUID REFERENCES address(id),
  position    JSONB,                                  -- {latitude, longitude} — geocoded, never user input
  metadata    JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE user_location (
  user_id     UUID NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES location(id)  ON DELETE CASCADE,
  is_primary  BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, location_id)
);

ALTER TABLE organization ADD COLUMN location_id UUID REFERENCES location(id);
ALTER TABLE encounter    ADD COLUMN location_id UUID REFERENCES location(id);  -- where the visit happened
```

> **Address**: street, city, zip, country — all go in the shared `address` table via `location.address_id`.
> `address.line TEXT[]` = street lines, `postal_code`, `city`, `state`, `district`, `country` (ISO 3166-1 alpha-2).
> `location.position JSONB` = `{ latitude, longitude }` — geocoded output, never user input. Map views and distance-based territory filters.
>
> `code` has no `UNIQUE` constraint — enterprise systems (Veeva, IQVIA) use their own codes, uniqueness enforced at app level on tenant insert.

Rep's HCPs: `JOIN organization ON location_id IN (SELECT location_id FROM user_location WHERE user_id = $repId)`
Manager's region: filter on `part_of_id` — all descendants via recursive CTE.

---

## 2. `lead` — TPT Person, no FHIR resource

```sql
CREATE TABLE lead (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id       UUID NOT NULL UNIQUE REFERENCES person(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'prospect',   -- prospect → qualified → converted | lost
  converted_to_id UUID REFERENCES hcp(id),            -- filled on conversion — full journey preserved
  source          TEXT,                               -- 'hcp_referral'|'congress'|'web'|'cold_call'
  assigned_to_id  UUID REFERENCES users(id),
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);
CREATE INDEX idx_lead_status   ON lead(status)         WHERE deleted_at IS NULL;
CREATE INDEX idx_lead_assigned ON lead(assigned_to_id) WHERE deleted_at IS NULL;
```

Conversion — single `withTenant` transaction:
```typescript
const hcp = await insertHcp(client, ctx, personInput)           // creates hcp record
await client.query(
  `UPDATE lead SET converted_to_id = $1, status = 'converted', updated_at = now() WHERE id = $2`,
  [hcp.id, leadId]
)
await writeAuditLog(client, ctx, 'lead.converted', 'lead', leadId, { hcpId: hcp.id })
```

---

## 3. `related_person` — FHIR R4 RelatedPerson

A person related to a patient or HCP who is NOT themselves a practitioner. Covers three use cases:
- **Patient caregiver / next-of-kin** — family member who accompanies patient, signs consent on their behalf
- **HCO contact** — secretary or practice manager at a clinic (not an HCP, but primary contact for reps)
- **GDPR guardian** — person with legal authority to manage another's data (child, incapacitated patient)

```sql
CREATE TABLE related_person (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id       UUID NOT NULL UNIQUE REFERENCES person(id) ON DELETE CASCADE,
  patient_id      UUID REFERENCES patient(id),        -- NULL if related to an HCO contact, not a patient
  hco_id          UUID REFERENCES hco(id),            -- NULL if related to a patient
  relationship    TEXT NOT NULL,                       -- FHIR v3-RoleCode: 'NOK'|'GUARD'|'CAREGIVER'|'CONT'
  active          BOOLEAN NOT NULL DEFAULT true,
  period_start    DATE,
  period_end      DATE,                                -- NULL = currently active
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ,
  CONSTRAINT related_person_subject_check CHECK (
    (patient_id IS NOT NULL AND hco_id IS NULL) OR
    (patient_id IS NULL AND hco_id IS NOT NULL)
  )
);
CREATE INDEX idx_related_person_patient ON related_person(patient_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_related_person_hco     ON related_person(hco_id)     WHERE deleted_at IS NULL;
```

```typescript
export interface RelatedPerson extends Person {
  patientId:    string | null   // related to a patient
  hcoId:        string | null   // or: HCO contact (secretary, manager)
  relationship: RelationshipCode // 'NOK' | 'GUARD' | 'CAREGIVER' | 'CONT'
  active:       boolean
  periodStart:  string | null
  periodEnd:    string | null   // null = currently active
}

// FHIR v3-RoleCode — most common in pharma CRM context
export type RelationshipCode =
  | 'NOK'       // next of kin
  | 'GUARD'     // legal guardian (child / incapacitated)
  | 'CAREGIVER' // informal caregiver
  | 'CONT'      // emergency contact
  | 'HCPNT'     // healthcare contact (HCO secretary / admin)
```

> **GDPR impact**: If `related_person` signs consent on behalf of a patient, `consent.subject_id` = patient, `consent.proof.witnessId` = related_person.id. The guardian's own GDPR data is held in their `person` row — erased independently via `eraseIdentity()`.
>
> **HCO contact use case**: Rep records the clinic secretary as `related_person` with `hco_id` set and `relationship = 'HCPNT'`. This gives the rep a proper contact record without polluting the `hcp` table with non-practitioners.

---

## 4. `hcp_role` — FHIR R4 PractitionerRole (extended)

Complete FHIR PractitionerRole: who promotes (`hcp_id`), at whose rep (`user_id`), which product (`product_id`), where (`location_id`), when (`period_start/end`).

```sql
ALTER TABLE hcp_role
  ADD COLUMN location_id  UUID REFERENCES location(id),  -- which territory this role applies to
  ADD COLUMN period_start DATE,
  ADD COLUMN period_end   DATE,                           -- NULL = currently active
  ADD COLUMN metadata     JSONB NOT NULL DEFAULT '{}';    -- cycle plan ref, quota, custom tenant fields

CREATE INDEX idx_hcp_role_active ON hcp_role(hcp_id, user_id) WHERE period_end IS NULL;
```

```typescript
export interface HcpRole {
  id:          string
  hcpId:       string
  userId:      string                    // rep who promotes
  productId:   string
  locationId:  string | null             // territory scope
  periodStart: string | null
  periodEnd:   string | null             // null = active
  metadata:    Record<string, unknown>   // extensible — cycle plan ref, quota, custom tenant fields
}
```

`promotedProducts` on `HcpDetail`: `SELECT FROM hcp_role WHERE hcp_id = $id AND user_id = $ctx.userId AND period_end IS NULL`

---

## 5. `lookup` — FHIR SearchParameter types

```sql
ALTER TABLE lookup ADD COLUMN search_type TEXT NOT NULL DEFAULT 'token';
-- 'token'     = dropdown / chip (visit_status, specialty, hco_type)
-- 'string'    = text search (name, city, email)
-- 'date'      = date range (last_encounter_at, created_at)
-- 'reference' = FK select (location_id, product_id, assigned_to_id)
```

```typescript
// Frontend: config.lookups('hcp_filters') → renders control by search_type — no hardcoded filter UI
// New filter = INSERT into lookup. Zero deploys.
```

---

## 6. `consent` — GDPR Art.7 + LFPDPPP ready

One table, both jurisdictions. `proof` JSONB stores technical evidence — required by both laws to demonstrate consent was valid.

```sql
ALTER TABLE consent
  ADD COLUMN provision_type        TEXT NOT NULL DEFAULT 'permit',  -- FHIR: 'permit' | 'deny'
  ADD COLUMN provision_purpose     TEXT[],                          -- ['treat','research','marketing','transfer']
  ADD COLUMN period_start          DATE,
  ADD COLUMN period_end            DATE,                            -- NULL = indefinite
  ADD COLUMN channel               TEXT,                            -- 'web_form'|'paper'|'verbal'|'email'
  ADD COLUMN privacy_notice_version TEXT,                           -- LFPDPPP: Aviso de Privacidad version
  ADD COLUMN withdrawn_at          TIMESTAMPTZ,                     -- revocation timestamp (both laws)
  ADD COLUMN withdrawn_reason      TEXT,
  ADD COLUMN proof                 JSONB NOT NULL DEFAULT '{}',     -- technical evidence
  ADD COLUMN metadata              JSONB NOT NULL DEFAULT '{}';     -- tenant custom fields

-- proof shape — stored at consent time, immutable after
-- {
--   "ip": "1.2.3.4",
--   "userAgent": "Mozilla/5.0...",
--   "documentHash": "sha256:abc...",   ← hash of privacy notice at time of consent
--   "witnessId": "user-uuid",          ← for paper/verbal: rep who witnessed
--   "locale": "pl" | "mx"             ← jurisdiction — drives legal interpretation
-- }

CREATE INDEX idx_consent_subject_active  ON consent(subject_id, subject_type) WHERE withdrawn_at IS NULL;
CREATE INDEX idx_consent_purpose         ON consent USING gin(provision_purpose);
```

```typescript
export interface Consent {
  id:                    string
  subjectId:             string
  subjectType:           'hcp' | 'patient' | 'lead'
  basis:                 'legitimate_interest' | 'explicit_consent' | 'contract' | 'legal_obligation'
  provisionType:         'permit' | 'deny'
  provisionPurpose:      string[]           // ['treat', 'research', 'marketing', 'transfer']
  periodStart:           string | null
  periodEnd:             string | null      // null = indefinite
  channel:               string | null      // how consent was collected
  privacyNoticeVersion:  string | null      // LFPDPPP: which Aviso de Privacidad
  withdrawnAt:           string | null      // null = active
  proof:                 Record<string, unknown>
  metadata:              Record<string, unknown>
  createdAt:             string
}
```

> **GDPR Art.7**: `proof.documentHash` proves which notice was shown. `withdrawn_at` enables right to withdraw.
> **LFPDPPP Art.8**: `privacy_notice_version` + `provision_purpose` covers _finalidades_ and _transferencias_.
> Never delete consent records — retain per `audit_log` jurisdiction rules.

---

## Red Flags

- ❌ Table still called `identities` — rename to `person` via migration, update all FK references (`person_id`)
- ❌ FK column still called `identity_id` after migration — must be `person_id` for naming consistency
- ❌ `territory` as separate table — use `location` with `type = 'TERRITORY'`
- ❌ `code TEXT UNIQUE` on `location` — blocks enterprise data import; uniqueness at app level only
- ❌ `lead` conversion without `converted_to_id` — loses the full prospect → hcp journey
- ❌ `hcp_role` without `location_id` and `period` — incomplete FHIR PractitionerRole, blocks territory scoping
- ❌ HCO contact (secretary) stored in `hcp` — use `related_person` with `relationship = 'HCPNT'`
- ❌ `related_person` with both `patient_id` and `hco_id` set — CHECK constraint prevents this
- ❌ Filter options hardcoded in Vue — all filter metadata through `lookup.search_type`
- ❌ New entity not in the alignment map above — every table needs a FHIR mapping or an ADR
