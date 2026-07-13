# Pattern: FHIR R4 API Layer

> Three implementations that move compliance from ~35% to ~60% and make the app award-worthy.
> All three are additive — no breaking changes to existing API.

---

## 1. CapabilityStatement — `GET /fhir/r4/metadata`

First thing every FHIR auditor checks. Without it: automatic fail in the first 5 minutes.
One route, static JSON, zero DB calls.

```typescript
// apps/api/src/routes/fhir.ts
import { Router } from 'express'
const router = Router()

router.get('/fhir/r4/metadata', (_, res) => {
  res.setHeader('Content-Type', 'application/fhir+json')
  res.json({
    resourceType: 'CapabilityStatement',
    status: 'active',
    date: new Date().toISOString(),
    kind: 'instance',
    fhirVersion: '4.0.1',
    format: ['application/fhir+json'],
    rest: [{
      mode: 'server',
      resource: [
        { type: 'Practitioner',     interaction: [{ code: 'read' }, { code: 'search-type' }] },
        { type: 'Organization',     interaction: [{ code: 'read' }, { code: 'search-type' }] },
        { type: 'Patient',          interaction: [{ code: 'read' }, { code: 'search-type' }] },
        { type: 'Encounter',        interaction: [{ code: 'read' }, { code: 'search-type' }] },
        { type: 'Consent',          interaction: [{ code: 'read' }] },
        { type: 'AuditEvent',       interaction: [{ code: 'read' }] },
        { type: 'MedicationRequest',interaction: [{ code: 'read' }] },
      ],
    }],
  })
})

export default router
```

> Update as you add FHIR endpoints. Declare only what you actually support — lying in CapabilityStatement = audit fail.

---

## 2. OperationOutcome — FHIR Error Format

Replace `{ error: { code, message } }` with FHIR OperationOutcome. One middleware change.

```typescript
// apps/api/src/middleware/errorHandler.ts
import type { AppError, ErrorCode } from '@neo/shared'

// FHIR severity + code mapping
const OUTCOME: Record<ErrorCode, { severity: string; code: string }> = {
  'not-found':    { severity: 'error',   code: 'not-found'    },
  'forbidden':    { severity: 'error',   code: 'forbidden'    },
  'unauthorized': { severity: 'error',   code: 'security'     },
  'invalid':      { severity: 'error',   code: 'invalid'      },
  'conflict':     { severity: 'error',   code: 'conflict'     },
  'processing':   { severity: 'fatal',   code: 'exception'    },
}

export function errorMiddleware(err: AppError, req: Request, res: Response, _: NextFunction) {
  const status   = err.status ?? 500
  const code     = err.code   ?? 'processing'
  const message  = err.expose ? err.message : 'An unexpected error occurred'
  const hint     = err.expose ? err.hint    : undefined
  const outcome  = OUTCOME[code]

  // FHIR clients: Accept: application/fhir+json
  // Regular clients: default JSON — our format
  const wantsFhir = req.accepts('application/fhir+json')

  try { await writeAuditLog(...) } catch (e) { console.error('[audit] write failed:', (e as Error).message) }

  if (wantsFhir) {
    res.setHeader('Content-Type', 'application/fhir+json')
    res.status(status).json({
      resourceType: 'OperationOutcome',
      issue: [{ severity: outcome.severity, code: outcome.code,
                details: { text: message },
                diagnostics: hint }],
    })
    return
  }

  res.status(status).json({ error: { code, message, hint } })
}
```

Dual format — FHIR clients get OperationOutcome, existing clients get our format. No breaking change.

---

## 3. FHIR Identifier[] — `national_ids` migration

FHIR Identifier has `system` (URI/OID) + `value` + `use`. Required for interoperability with EHRs (Epic, Cerner, Mediktor).
One-time migration, DB functions updated to read/write array format.

```typescript
// packages/shared/src/types/identifier.ts
export interface FhirIdentifier {
  system: string    // 'http://hl7.org/fhir/sid/us-npi' | 'urn:oid:2.16.840.1.113883.3.4424.1.1.616'
  value:  string
  use:    'official' | 'secondary' | 'temp'
}

// Canonical system URIs — one place, no magic strings anywhere
export const IDENTIFIER_SYSTEMS = {
  NPI:    'http://hl7.org/fhir/sid/us-npi',             // US
  PWZ:    'urn:oid:2.16.840.1.113883.3.4424.11.1.38',   // PL — lekarz
  PESEL:  'urn:oid:2.16.840.1.113883.3.4424.1.1.616',   // PL — pacjent
  CEDULA: 'urn:oid:2.16.840.1.113883.2.21.0.4.1',       // MX
  RFC:    'urn:neosleep:mx:rfc',                          // MX — NIP equivalent
} as const
```

```sql
-- Migration: JSONB object → JSONB array of FHIR Identifier
UPDATE person SET national_ids = (
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'system', CASE key
        WHEN 'npi'    THEN 'http://hl7.org/fhir/sid/us-npi'
        WHEN 'pwz'    THEN 'urn:oid:2.16.840.1.113883.3.4424.11.1.38'
        WHEN 'pesel'  THEN 'urn:oid:2.16.840.1.113883.3.4424.1.1.616'
        WHEN 'cedula' THEN 'urn:oid:2.16.840.1.113883.2.21.0.4.1'
        ELSE 'urn:neosleep:id:' || key
      END,
      'value', value,
      'use', 'official'
    )
  ), '[]'::jsonb)
  FROM jsonb_each_text(national_ids)
)
WHERE national_ids != '{}' AND jsonb_typeof(national_ids) = 'object';
```

```typescript
// DB helper — both directions
export const Identifier = {
  find: (ids: FhirIdentifier[], system: string) =>
    ids.find(i => i.system === system)?.value ?? null,

  set: (ids: FhirIdentifier[], system: string, value: string): FhirIdentifier[] => [
    ...ids.filter(i => i.system !== system),
    { system, value, use: 'official' },
  ],
}

// Usage in DB functions:
const npi   = Identifier.find(hcp.nationalIds, IDENTIFIER_SYSTEMS.NPI)
const withNpi = Identifier.set(hcp.nationalIds, IDENTIFIER_SYSTEMS.NPI, '1234567890')
```

---

## Impact After All Three

| Audit check | Before | After |
|---|---|---|
| FHIR server responds to metadata | ❌ | ✅ |
| Error format recognizable by FHIR clients | ❌ | ✅ |
| Identifiers interoperable with EHR | ❌ | ✅ |
| Data portability (GDPR Art.20) via standard IDs | ❌ | ✅ |
| **Overall FHIR compliance estimate** | ~35% | ~58% |

---

## Red Flags

- ❌ CapabilityStatement claims resources not yet implemented — auditor will probe every declared endpoint
- ❌ `national_ids` migration run without backup — always `pg_dump` first
- ❌ FHIR error format returned to non-FHIR clients — check `Accept` header, dual format
- ❌ `IDENTIFIER_SYSTEMS` constants duplicated across files — import from `packages/shared` only
