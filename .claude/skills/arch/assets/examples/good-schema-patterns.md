# Pattern: Schema Decisions That Can't Be Retrofitted

> These columns cost nothing before the first row. They cost a lot after.
> Add all of them unconditionally on every relevant table.

---

## 1. GDPR Erasure — `erased_at` on `person`

```sql
ALTER TABLE person ADD COLUMN erased_at TIMESTAMPTZ;
CREATE INDEX idx_person_erased ON person(erased_at) WHERE erased_at IS NOT NULL;
```

```typescript
// Anonymize in place — UUID survives for FK integrity, PII is gone
export async function eraseIdentity(ctx: RequestContext, id: string) {
  return withTenant(ctx.tenantSlug, async (client) => {
    await client.query(
      `UPDATE person SET first_name='ERASED', last_name='ERASED',
       email=NULL, phone=NULL, national_ids='[]', erased_at=now() WHERE id=$1`,
      [id]
    )
    await writeAuditLog(client, ctx, 'identity.erased', 'identity', id, { basis: 'gdpr_art17' })
  })
}
```

Every list query on person-based tables: `WHERE erased_at IS NULL`. Display layer: show `[Removed]` when `erased_at IS NOT NULL`.

---

## 2. Encryption at Rest — `national_ids` (GDPR Art.9)

PESEL / NPI / PWZ are special category. Key per company in `platform.companies` → KMS. Never in tenant schema.

```typescript
// packages/shared/src/crypto.ts — one place, all DB functions import from here
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

export function encryptJson(data: Record<string, string>, key: Buffer): Buffer {
  const iv = randomBytes(16)
  const c  = createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([c.update(JSON.stringify(data), 'utf8'), c.final()])
  return Buffer.concat([iv, c.getAuthTag(), enc])   // iv(16) + tag(16) + ciphertext
}

export function decryptJson(buf: Buffer, key: Buffer): Record<string, string> {
  const d = createDecipheriv('aes-256-gcm', key, buf.subarray(0, 16))
  d.setAuthTag(buf.subarray(16, 32))
  return JSON.parse(d.update(buf.subarray(32)) + d.final('utf8'))
}
```

Migration: add `national_ids_enc BYTEA`, backfill, drop original. Rotation via `encryption_key_version` on `platform.companies`.

---

## 3. Optimistic Locking — `version INTEGER`

Add to every entity with concurrent editing: `practitioner`, `organization`, `lead`, `patient`.

```sql
ALTER TABLE practitioner ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
```

```typescript
const { rowCount } = await client.query(
  `UPDATE practitioner SET ..., version = version + 1, updated_at = now()
   WHERE id = $1 AND version = $2 AND deleted_at IS NULL`,
  [id, input.version]
)
if (rowCount === 0) throw createError('conflict', 'Record was modified — reload and try again')
```

`version` returned in every GET. Client sends it back on PATCH. No polling, no extra round-trip.

---

## 4. Jurisdiction-Aware Retention — `retain_until` on `audit_log`

```sql
ALTER TABLE platform.audit_log ADD COLUMN retain_until TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '5 years';
CREATE INDEX idx_audit_retain ON platform.audit_log(retain_until);
```

```typescript
const RETENTION: Record<string, string> = { pl: '3 years', mx: '5 years', us: '6 years', th: '3 years' }
// Set at INSERT — jurisdiction from platform.tenants
await client.query(`INSERT INTO platform.audit_log (..., retain_until) VALUES (..., now() + $1::INTERVAL)`,
  [RETENTION[jurisdiction] ?? '5 years'])
```

Monthly job: `DELETE FROM platform.audit_log WHERE retain_until < now()`.

---

## 5. Composite Indexes — Before First Row

```sql
CREATE INDEX idx_practitioner_active        ON practitioner(visit_status)              WHERE deleted_at IS NULL;
CREATE INDEX idx_encounter_practitioner_date ON encounter(practitioner_id, created_at DESC);
CREATE INDEX idx_consent_subject_active      ON consent(subject_id)                    WHERE active = true;
CREATE INDEX idx_person_email                ON person(email)                          WHERE erased_at IS NULL;
```

Rule: `EXPLAIN ANALYZE` every list query before merge. Seq scan on >1 000 rows = block.

---

## 6. Territory as Entity — `territory_id UUID FK`

```sql
CREATE TABLE territory (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID REFERENCES territory(id),   -- region → district → city
  code      TEXT NOT NULL UNIQUE,             -- 'PL-MAZ-WAW-MOK' — stable, used in audit log
  name      TEXT NOT NULL,
  level     TEXT NOT NULL CHECK (level IN ('region','district','city')),
  metadata  JSONB NOT NULL DEFAULT '{}'
);
CREATE TABLE user_territory (
  user_id      UUID NOT NULL REFERENCES users(id)      ON DELETE CASCADE,
  territory_id UUID NOT NULL REFERENCES territory(id)  ON DELETE CASCADE,
  is_primary   BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, territory_id)
);
ALTER TABLE organization ADD COLUMN territory_id UUID REFERENCES territory(id);
```

Rep sees "my HCPs": `JOIN organization ON territory_id IN (SELECT territory_id FROM user_territory WHERE user_id = $repId)`. Manager sees region: filter by `parent_id`.

---

## Red Flags

- ❌ `erased_at` missing — can't comply with Art.17 without breaking FK integrity
- ❌ `national_ids` plain text — fails ISO 27001 / HIPAA at first audit
- ❌ No `version` — last write wins silently in concurrent edits
- ❌ `retain_until` missing — audit log grows forever or deleted manually (both wrong)
- ❌ Indexes after go-live — invisible until seq scan on 50k rows kills the list view
- ❌ `territory_code TEXT` — blocks territory management and manager dashboards without migration
