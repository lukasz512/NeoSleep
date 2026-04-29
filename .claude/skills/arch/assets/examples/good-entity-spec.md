# Entity Spec — Three Variants

> Every entity is one of three shapes. Pick the variant, fill the blanks.
> All types extend `BaseEntity` or `Person` from `packages/shared/src/types/`.
> Pipeline is always: DB → `apps/api/db/` → route → `packages/shared` types → composable → view → i18n.

---

## Variant A — Person / TPT (`hcp`)

Person entity. Extends `person` via `person_id UNIQUE FK`. API JOINs both, returns flat type.
Use for: hcp, patient, lead, users.

```sql
CREATE TABLE hcp (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id    UUID NOT NULL UNIQUE REFERENCES person(id) ON DELETE CASCADE,
  specialty    TEXT,
  visit_status TEXT NOT NULL DEFAULT 'new',
  metadata     JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ
);
-- Multi-affiliation (when entity links to an org):
CREATE TABLE hcp_affiliation (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hcp_id     UUID NOT NULL REFERENCES hcp(id) ON DELETE CASCADE,
  hco_id     UUID NOT NULL REFERENCES hco(id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  metadata   JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(hcp_id, hco_id)
);
```

```typescript
// List type — rep sees identity + specialty + one clinic. No over-fetching.
export interface Hcp extends Person {
  specialty:   string | null
  visitStatus: VisitStatus
  primaryHco:  { id: string; name: string; territoryCode: string | null } | null
}

// Detail type — only loaded on /hcps/:id, where manager can change clinic
export interface HcpDetail extends Hcp {
  affiliations: HcpAffiliation[]   // full list for edit UI
}

export interface InsertHcpInput extends PersonInput {
  specialty?: string
  hcoId?:     string   // creates is_primary=true affiliation on insert
}
export type UpdateHcpInput = Partial<InsertHcpInput & {
  visitStatus:   VisitStatus
  primaryHcoId:  string   // reassign primary clinic — DB clears others, sets this one
}>
```

`getHcps` JOINs `hcp_affiliation WHERE is_primary = true` → returns `Hcp[]` (light).
`getHcpById` JOINs all affiliations → returns `HcpDetail` (full).
`insertHcp`: check for existing identity (`email` OR `national_ids @>`), reuse or create — all in one transaction.
`updateHcp`: if `primaryHcoId` present → single statement:
```sql
UPDATE hcp_affiliation SET is_primary = (hco_id = $primaryHcoId) WHERE hcp_id = $hcpId
```
Then write to `audit_log`: action `hcp.primary_hco.changed`, payload `{ from: oldHcoId, to: primaryHcoId }`.
Audit log is what powers the change history shown to both rep and admin in the detail view.

| Layer | Path |
|---|---|
| DB | `apps/api/db/hcp.ts` — `getHcps`, `getHcpById`, `insertHcp`, `updateHcp`, `softDeleteHcp` |
| Route | `apps/api/routes/hcp.ts` — GET /api/hcps → `Hcp[]`, GET /api/hcps/:id → `HcpDetail`, POST, PATCH /api/hcps/:id (includes primaryHcoId), DELETE, POST /api/hcps/:id/affiliations, DELETE /api/hcps/:id/affiliations/:hcoId |
| Types | `packages/shared/src/types/hcp.ts` |
| Composable | `apps/app/src/composables/useHcps.ts` — not a store |
| View | `apps/app/src/views/HcpsView.vue` — AppEntityList slot |
| i18n | `user.hcps.*` |

---

## Variant B — Organization (`hco`)

Org entity. Does NOT extend `identities`. Extends `BaseEntity`. Owns `address` and `territory_code`.
HCP derives address + territory from primary affiliation's HCO — not stored on HCP directly.
Use for: hco, any non-person org.

```sql
CREATE TABLE hco (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  type           TEXT,            -- 'hospital'|'clinic'|'pharmacy'|'dental'|'lab'
  address_id     UUID REFERENCES address(id) ON DELETE SET NULL,
  territory_code TEXT,            -- 'PL-MAZ-WAW-MOK' — denormalized from address
  phone          TEXT,
  email          TEXT,
  website        TEXT,
  metadata       JSONB NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at     TIMESTAMPTZ
);
-- address table — FHIR R4 Address datatype (shared by hco, patient, lead)
CREATE TABLE address (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  use          TEXT,            -- FHIR Address.use: 'home'|'work'|'temp'|'billing'
  line         TEXT[],          -- FHIR Address.line[]: ['ul. Marszałkowska 1/5', 'lok. 3']
  city         TEXT,            -- FHIR Address.city
  district     TEXT,            -- FHIR Address.district: powiat / county
  state        TEXT,            -- FHIR Address.state: województwo / stan / estado
  postal_code  TEXT,            -- FHIR Address.postalCode: '00-001' / '06600'
  country      TEXT,            -- FHIR Address.country: ISO 3166-1 alpha-2 'PL'|'MX'|'US'
  lat          NUMERIC(9,6),    -- for map views — derived from geocoding, not user input
  lng          NUMERIC(9,6),
  metadata     JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
  -- no deleted_at — address record is replaced on change, never soft-deleted
);
CREATE INDEX idx_address_city    ON address(city);
CREATE INDEX idx_address_country ON address(country);
```

```typescript
// FHIR R4 Address — packages/shared/src/types/address.ts
export type AddressUse = 'home' | 'work' | 'temp' | 'billing'

export interface Address {
  id:         string
  use:        AddressUse | null
  line:       string[]          // ['ul. Marszałkowska 1/5', 'lok. 3'] — display as line.join(', ')
  city:       string | null
  district:   string | null     // powiat / county
  state:      string | null     // województwo / stan / estado
  postalCode: string | null
  country:    string | null     // ISO 3166-1 alpha-2
  lat:        number | null
  lng:        number | null
}

export interface InsertAddressInput {
  use?:       AddressUse
  line:       string[]          // required — at minimum ['street number']
  city?:      string
  district?:  string
  state?:     string
  postalCode?: string
  country?:   string
}

export interface Hco extends BaseEntity {
  name:          string
  type:          HcoType | null
  address:       Address | null
  territoryCode: string | null
  phone:         string | null
  email:         string | null
  website:       string | null
}
export interface InsertHcoInput {
  name: string; type?: HcoType; address?: InsertAddressInput
  phone?: string; email?: string; website?: string
}
export type UpdateHcoInput = Partial<InsertHcoInput>
```

| Layer | Path |
|---|---|
| DB | `apps/api/db/hco.ts` — `getHcos`, `getHcoById`, `insertHco` (creates address in transaction), `updateHco`, `softDeleteHco` |
| Route | `apps/api/routes/hco.ts` — GET /api/hcos, GET /api/hcos/:id, POST, PATCH, DELETE |
| Types | `packages/shared/src/types/hco.ts`, `packages/shared/src/types/address.ts` |
| Composable | `apps/app/src/composables/useHcos.ts` |
| View | `apps/app/src/views/HcosView.vue` |
| i18n | `user.hcos.*` |

---

## Variant C — Simple Entity (`product`)

No identity, no address. Extends `BaseEntity` only.
Use for: product, presentation, template, any reference/config entity.

```sql
CREATE TABLE product (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  code             TEXT UNIQUE,
  indication       TEXT,
  active_substance TEXT,
  keywords         TEXT[],   -- GIN indexed — ARRAY['sleep','apnea','CPAP']
  active           BOOLEAN NOT NULL DEFAULT true,
  metadata         JSONB NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ
);
CREATE INDEX idx_product_keywords ON product USING gin(keywords);
-- GIN: indexes each array element — enables WHERE keywords @> ARRAY['CPAP'] in O(log n)
```

```typescript
export interface Product extends BaseEntity {
  name:            string
  code:            string | null
  indication:      string | null
  activeSubstance: string | null
  keywords:        string[]
  active:          boolean
}
export interface InsertProductInput {
  name: string; code?: string; indication?: string
  activeSubstance?: string; keywords?: string[]
}
export type UpdateProductInput = Partial<InsertProductInput & { active: boolean }>
```

| Layer | Path |
|---|---|
| DB | `apps/api/db/product.ts` — `getProducts`, `getProductById`, `insertProduct`, `updateProduct`, `softDeleteProduct` |
| Route | `apps/api/routes/product.ts` — GET /api/products, GET /api/products/:id, POST, PATCH, DELETE |
| Types | `packages/shared/src/types/product.ts` |
| Composable | `apps/app/src/composables/useProducts.ts` |
| View | `apps/app/src/views/ProductsView.vue` (admin-only) |
| i18n | `user.products.*` |

---

## Cross-Entity: Notes and Interaction History

Applies to **HCP and HCO**. Both entities support comments and a full interaction timeline.

### `communication` — FHIR Communication — notes/comments

Freeform note attached to any entity. No note field on `hcp`/`hco` directly — everything goes here.

```sql
CREATE TABLE communication (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type TEXT NOT NULL,        -- 'hcp' | 'hco' | 'lead' | 'patient'
  subject_id   UUID NOT NULL,        -- FK to the referenced entity
  author_id    UUID NOT NULL REFERENCES users(id),
  body         TEXT NOT NULL,
  pinned       BOOLEAN NOT NULL DEFAULT false,  -- pinned = shown in detail card header
  metadata     JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
  -- NEVER delete — legal record (FHIR Communication)
);
CREATE INDEX idx_communication_subject ON communication(subject_type, subject_id);
CREATE INDEX idx_communication_pinned  ON communication(subject_id) WHERE pinned = true;
```

`HcpDetail` includes `pinnedNote: Communication | null` — returned by single JOIN `WHERE pinned = true LIMIT 1`. That's what appears in the header card.

### `encounter` — FHIR Encounter — interaction history

All contact events between a rep and an HCP/HCO. Partitioned by month.

```sql
-- encounter.type from lookups — tenant-configurable, not hardcoded
-- defaults: 'f2f' | 'call' | 'congress' | 'webinar' | 'message'
-- FHIR Encounter.class: AMB (f2f), VR (virtual/webinar), PHONE (call)
```

```typescript
// Lightweight summary shown in the Visits tab list
export interface EncounterSummary {
  id:        string
  type:      string           // from lookups: 'f2f' | 'call' | 'congress' | ...
  date:      string
  summary:   string | null    // first line of the PCF or free text
  outcome:   string | null    // from lookups: 'positive' | 'neutral' | 'negative'
}
```

`HcpDetail.encounters` — loaded separately via `GET /api/encounters?hcpId=:id` — NOT embedded in the HCP payload. The Visits tab fetches on demand.

### Type shape in `HcpDetail`

```typescript
export interface HcpDetail extends Hcp {
  affiliations: HcpAffiliation[]           // for "Change clinic" UI
  pinnedNote:   Communication | null       // shown in header card
  // encounters loaded on demand — GET /api/encounters?hcpId=:id
}
```

---

## Shared Base Types — `packages/shared/src/types/`

```typescript
// base.ts — extended by all entities
export interface BaseEntity {
  id: string; metadata: Record<string, unknown>
  createdAt: string; updatedAt: string; deletedAt: string | null
}

// person.ts — extended by all person entities (Variant A) — FHIR R4 Person
export interface Person extends BaseEntity {
  prefix: string | null; firstName: string; lastName: string
  email: string | null; phone: string | null
  nationalIds: FhirIdentifier[]; preferredLanguage: string
  dataProcessingBasis: string | null; privacyNoticeAcceptedAt: string | null
}
export interface PersonInput {
  firstName: string; lastName: string
  prefix?: string; email?: string; phone?: string
  nationalIds?: FhirIdentifier[]; preferredLanguage?: string
}
```
