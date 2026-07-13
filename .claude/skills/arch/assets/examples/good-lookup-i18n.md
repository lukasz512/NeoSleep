# Pattern: Lookup — FHIR Codes + i18n

> **Why this matters**: Lookup values power every dropdown, chip, and filter in the app.
> To win FHIR certification and connect to US EHRs (Epic, Cerner), each value needs a FHIR code alongside it.
> Translations stay in `en.json` — exactly as they already are.

---

## The Split: Two Separate Concerns

| Concern | Who reads it | Where it lives |
|---|---|---|
| **Display text** ("Face to face", "Wizyta osobista") | Human — rep, HCP, auditor | `packages/i18n/en.json` → already works |
| **FHIR code** (`AMB`, `PHONE`, `VR`) | Machine — Epic, Cerner, FHIR validator | `lookup.fhir_code` + `lookup.fhir_system` |

These are two different problems. Mixing them (storing translations in the DB) is unnecessary complexity. The codebase already solves display text via i18n. We only need to add the FHIR codes.

---

## What to Add to `lookup`

One migration. Two columns.

```sql
ALTER TABLE lookup
  ADD COLUMN fhir_code   TEXT,   -- FHIR code: 'AMB' | 'PHONE' | 'VR' | NULL for custom
  ADD COLUMN fhir_system TEXT;   -- system URI: 'http://terminology.hl7.org/CodeSystem/v3-ActCode'
                                  --             'urn:neosleep:lookup' for tenant-custom values
```

That's it for schema. No `labels JSONB`. Translations stay in `en.json`.

---

## How It Works — Standard Value

```
lookup.value = 'f2f'
lookup.fhir_code = 'AMB'
lookup.fhir_system = 'http://terminology.hl7.org/CodeSystem/v3-ActCode'
```

**In the app** — rep sees "Wizyta osobista" from `$t('user.encounters.type.f2f')` — i18n as always.

**In FHIR response** — Epic gets:
```json
{ "coding": [{ "system": "http://terminology.hl7.org/CodeSystem/v3-ActCode", "code": "AMB", "display": "ambulatory" }] }
```

Two channels, same data, right format for each audience.

---

## How It Works — Tenant Custom Value

A tenant admin adds a custom encounter type ("Congress dinner") that doesn't exist in any FHIR ValueSet.

```sql
INSERT INTO lookup (key, value, fhir_code, fhir_system) VALUES
  ('encounter_type', 'congress_dinner', NULL, 'urn:neosleep:lookup');
```

```
fhir_code = NULL       → no standard code exists
fhir_system = 'urn:neosleep:lookup'  → signals: proprietary, not a FHIR standard
```

Display text: tenant adds `user.encounters.type.congress_dinner` via `i18n_overrides` table (already exists). No labels JSONB needed.

---

## Seeding Standard Values

```sql
-- Run once per tenant schema, or as platform seed data
UPDATE lookup SET
  fhir_code   = 'AMB',
  fhir_system = 'http://terminology.hl7.org/CodeSystem/v3-ActCode'
WHERE key = 'encounter_type' AND value = 'f2f';

UPDATE lookup SET
  fhir_code   = 'PHONE',
  fhir_system = 'http://terminology.hl7.org/CodeSystem/v3-ActCode'
WHERE key = 'encounter_type' AND value = 'call';

UPDATE lookup SET
  fhir_code   = 'VR',
  fhir_system = 'http://terminology.hl7.org/CodeSystem/v3-ActCode'
WHERE key = 'encounter_type' AND value = 'webinar';

-- Tenant-custom values with no FHIR equivalent:
UPDATE lookup SET fhir_system = 'urn:neosleep:lookup'
WHERE fhir_code IS NULL AND fhir_system IS NULL;
```

---

## FHIR Serializer — CodeableConcept

```typescript
// packages/shared/src/fhir/codeable-concept.ts
export function toCodeableConcept(
  lookup: Pick<Lookup, 'value' | 'fhirCode' | 'fhirSystem'>,
  display: string,   // already translated — pass $t('user.encounters.type.f2f')
): FhirCodeableConcept {
  return {
    coding: [{
      system:  lookup.fhirSystem ?? 'urn:neosleep:lookup',
      code:    lookup.fhirCode   ?? lookup.value,
      display,
    }],
    text: display,
  }
}
```

The translated display string comes from wherever the caller already has it — the route handler reads `Accept-Language`, maps to `en | pl | mx`, picks the right i18n string. No second source of truth.

---

## `audit_log` — FHIR AuditEvent Columns

Three additive columns so `audit_log` rows can be serialized as FHIR AuditEvent — required for HIPAA and SOC 2 audit trail conformance.

```sql
ALTER TABLE audit_log
  ADD COLUMN agent_who   TEXT,   -- 'user:<userId>' — who performed the action
  ADD COLUMN source_site TEXT,   -- 'bff' | 'admin' | 'system' — where it came from
  ADD COLUMN entity_type TEXT;   -- FHIR entity.type code: '1'=Person '3'=Organization '4'=Other
```

```typescript
// One function, used everywhere — no changes to call sites, just add 3 fields
export async function writeAuditLog(
  client:       PoolClient,
  ctx:          RequestContext,
  action:       string,           // 'hcp.updated' | 'lead.converted' | 'person.erased'
  resourceType: string,           // 'Practitioner' | 'Patient' | 'Person' | 'Encounter'
  resourceId:   string,
  payload:      Record<string, unknown> = {},
): Promise<void> {
  const ENTITY_TYPE: Record<string, string> = {
    Person: '1', Practitioner: '1', Patient: '1', RelatedPerson: '1',
    Organization: '3',
  }
  const RETENTION: Record<string, string> = { pl: '3 years', mx: '5 years', us: '6 years' }
  const jurisdiction = ctx.tenantSlug.split('_').pop() ?? 'pl'  // 'neosleep_pl' → 'pl'

  await client.query(
    `INSERT INTO audit_log
       (action, resource_type, resource_id, actor_id, payload,
        agent_who, source_site, entity_type, retain_until)
     VALUES ($1,$2,$3,$4,$5, $6,'bff',$7, now() + $8::INTERVAL)`,
    [
      action, resourceType, resourceId, ctx.userId,
      JSON.stringify(payload),
      `user:${ctx.userId}`,
      ENTITY_TYPE[resourceType] ?? '4',
      RETENTION[jurisdiction] ?? '5 years',
    ]
  )
}

// Serializer: row → FHIR AuditEvent (for GET /fhir/r4/AuditEvent)
export function toFhirAuditEvent(row: AuditLogRow): object {
  return {
    resourceType: 'AuditEvent',
    id:           row.id,
    meta: {
      versionId:   '1',           // write-once (ADR-010) — always 1
      lastUpdated: row.createdAt,
    },
    type:    { system: 'http://terminology.hl7.org/CodeSystem/audit-event-type', code: 'rest' },
    recorded: row.createdAt,
    agent:   [{ who: { reference: `Person/${row.actorId}` }, requestor: true }],
    source:  { site: row.sourceSite ?? 'bff', observer: { display: 'NeoCRM BFF' } },
    entity:  [{ what: { reference: `${row.resourceType}/${row.resourceId}` },
                type: { code: row.entityType ?? '4' } }],
  }
}
```

---

## What This Unlocks

| Audit / certification check | Before | After |
|---|---|---|
| Encounter type serializable as CodeableConcept | ❌ | ✅ |
| FHIR validator accepts `Encounter.class` field | ❌ | ✅ |
| AuditEvent passes FHIR R4 validation | ❌ | ✅ |
| HIPAA §164.312(b) — audit agent identified | ❌ | ✅ |
| Epic App Orchard — encounter type terminology | ❌ | ✅ |

---

## Red Flags

- ❌ New lookup value added without checking if a standard FHIR code exists — always look up v3-ActCode first
- ❌ `fhir_code` set but `fhir_system` NULL — CodeableConcept invalid, FHIR validator rejects
- ❌ Translations stored in `lookup` table — they belong in `en.json` / `i18n_overrides`
- ❌ `writeAuditLog` called without `agent_who` populated — HIPAA violation, FHIR AuditEvent invalid
