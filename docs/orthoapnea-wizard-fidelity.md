# NOA (OrthoApnea) order wizard — fidelity notes

Living reference for `apps/pwa/src/components/patient/OrthoApneaOrderWizard.vue` and its
child components. This captures everything confirmed about OrthoApnea's own real order
wizard through iterative live comparison (screenshots against apneadock.com) and two
Chrome-Claude live-capture rounds, plus what's still an unconfirmed approximation. Read
this before touching wizard layout/validation again — it exists specifically so that
knowledge doesn't have to be re-derived from chat history on every pass.

User-facing branding: the product is always called **"NOA"** in the PWA, never
"OrthoApnea" — reps order NOA; OrthoApnea is the manufacturer/partner, an implementation
detail. Exception: the admin-only transaction log (`OrthoApneaTransactionLog.vue`) still
says "OrthoApnea" — it's a technical debugging view about the actual partner API, where
naming the real partner is useful, not brand-facing copy. Code identifiers, routes, DB
tables, and ADRs also keep the "orthoapnea" name — only i18n *values* changed.

## Confirmed validation rules (from a live OA screenshot)

- **MR must be strictly less than MP** (`retrusionMax < protrusionMax`). OA shows a red
  inline error below the fields when violated, doesn't block typing, blocks advancing.
- **MR and MP must each be within `[-20, 20]` mm.** Confirmed via a live OA screenshot
  showing the ruler's own `-2cm`/`2cm` end labels.
- Our error priority when both are violated: range error first, then the MR<MP relational
  error (`mrMpErrorMessage` in the wizard component).
- Validation is **suppressed until the rep actually edits MR or MP** (`mrMpTouched`) — both
  fields start at 0, and `0 < 0` is false, so showing the error immediately on open would
  be wrong. Same "touched" pattern already used for the wizard's general dirty-tracking.
- **Producto (product) is mandatory** to advance past Step 2 (`step2Valid`).
- **Médico (doctorId) is mandatory** to advance past Step 1 (`step1Valid`) — this is
  independent of the alternative-address sub-form's own required fields.
- Alternative-address sub-form fields (country, postal code, city, address, name, email
  format, phone) are required *only when* "Alternative address" is selected — this part is
  still our own conservative default, not confirmed against OA's real required-field set.

Still unconfirmed (see the published capture checklist in the conversation this doc came
from, or ask for a fresh one): required/optional status for most Step 2/3 fields beyond
the above, exact numeric ranges for deviation/laterality/opening-limitation, and whether
Starting Point value must fall between MR and MP.

## Confirmed layout structure (live screenshot comparison)

OA's own wizard groups Paso 2 content into what reads as **3 visually distinct blocks**,
in this order:

1. **MR / MP / Rango avance mandibular** — MR stacked directly above MP in the left half
   of the row; the computed "Rango avance mandibular" value fills the right half, shown
   large (it's the only content in that half). No divider below this block.
2. **Desviación de la línea media** — has its own section title (was missing in an earlier
   pass — the diagrams alone aren't self-explanatory without it). Each diagram has
   Izquierda on its left, Derecha on its right, both centered above their fields, no
   trailing colon on either label. See "Deviation diagram behavior" below for what the
   diagrams themselves show.
3. **Starting Point (SP) + ruler**, followed by the rest of "Paso 2: Configuración del
   tratamiento" (Tipo de secuencia, Morning Aligner, etc.) — **Starting Point belongs under
   the Paso 2 header, not Paso 1.** An earlier pass had it grouped with Paso 1's
   measurements; that was wrong. Order: Paso 2 title → Starting Point header/fields/ruler →
   divider → Tipo de secuencia → ... .

A `VDivider` separates block 2 from block 3, but **not** block 1 from block 2 (removed
after specific feedback that it wasn't wanted there).

## Deviation diagram behavior (`DeviationDiagram.vue`)

Confirmed from a live OA recording: changing Derecha/Izquierda shifts **only the lower
jaw half** of the image left/right — the upper jaw stays fixed as the visual reference.
It is not a line drawn over a static image. Implementation detail: the source JPG
(`teeth_medium_line_deviation.jpg`) is a single flat image with both arches baked in, so
this is achieved by splitting it into two halves via `background-position` (upper half
fixed, lower half's div `translateX`'d) rather than compositing separate assets. The exact
mm→pixel mapping OA uses internally is still an approximation (±10mm → a fixed max shift),
not verified.

## Mandibular ruler (`MandibularRuler.vue`)

- Range is confirmed: `±20mm` maps to the ruler's full width (see validation rules above).
- The upper incisor image stays fixed at center (same "upper is the reference" convention
  as the deviation diagram); only the lower incisor moves, tracking the current Starting
  Point position. An earlier version bound the two images directly to MR/MP, which at
  extreme values sent them to opposite ends of the ruler — fixed.
- The exact value→pixel curve beyond "±20mm maps to full width" is still an approximation.

## Product catalog filtering

Only products whose name contains **NOA**, **MORNING ALIGNER**, or **ORTHOBRUX** are
offered in the picker (`isOfferedProductFamily` in the wizard component) — OA's full
catalog has many other products this rep flow never needs. Sort order within those:
bare "NOA" first (auto-selected on open), then "MORNING ALIGNER", then each family's own
variants (reimpresión/replanificación/reajuste etc.), then everything else alphabetically.
Morning Aligner's checkbox and its presence in the product chips are kept in sync
bidirectionally (`OrthoApneaOrderWizard.vue`'s two `watch()` calls on `form.morningAligner`
/ `form.products`).

## Paso 3/4 sizing

Band design ("Diseño de férula") pickers have **no visible number captions** on OA's real
site — ours matches (`hide-labels` prop on `IconOptionPicker`), numbers kept only as
`aria-label`/`alt` for accessibility. Acabado (finish) tiles are enlarged via the `fill`
prop so 2 options read as visually equal in weight to the 6-option band picker above them,
without inflating the tile's own padding (only the image content grew).

Teeth diagram (`TeethDiagram.vue`): FDI numbers are baked into OA's own downloaded tooth
PNG assets already — our own separate number captions were redundant and removed. Teeth
are packed with zero gap between them (`gap: 0`), matching OA's dense layout. A relieved
tooth is filled with a near-opaque color wash (`rgba(warning, 0.82)`) as the closest CSS-only
approximation of OA's real solid-fill look — **the source PNGs are opaque-white-background
line art, not transparent**, so a true solid fill isn't achievable without downloading
actual filled-tooth image assets, which were never part of the original asset pull. If
pixel-perfect matching is ever required here, that's a new, separate asset-capture task.

## Shared components this wizard uses (reusable app-wide, not OA-specific)

- `apps/pwa/src/components/EmailField.vue` — the one email input for the whole PWA
  (icon + insert-@ button + caller-supplied format rule). `FormRenderer.vue` renders this
  for every `type: "email"` field too — don't reintroduce a second copy of the "@" button
  logic elsewhere.
- `apps/pwa/src/components/PhoneField.vue` — has a `defaultCountryCode` prop (added for
  this wizard) so a field about someone other than the logged-in rep (e.g. the patient's
  alternative-address phone) can default its area code to *their* country instead of the
  rep's own `authStore.user?.country_code`.
- `apps/pwa/src/components/AppConfirmDialog.vue` — the one "two-option" confirm dialog
  (discard/save-draft, discard-changes, etc.), reusing the established
  `.pwa-confirm-dialog__card`/`.pwa-discard-dialog` tonal styling instead of a bespoke
  ad-hoc dialog per feature. `OrthoApneaOrderWizard.vue`'s save-draft prompt uses it;
  `FormRenderer.vue`/`EventForm.vue`'s own discard-confirm dialogs were left as-is
  (already correctly styled, low value in touching working code for this pass).
- `apps/pwa/src/components/patient/NumberStepperField.vue` — big +/- buttons flanking a
  number input, used for every measurement field in this wizard (MR, MP, deviation,
  Starting Point, sequence, laterality, opening limitation).

## Admin-only features layered on top (not OA fidelity, our own additions)

- **Transaction log** (`OrthoApneaTransactionLog.vue` + `GET
  /partners/orthoapnea/treatments/:id/transactions`, admin-only) — full request/response
  JSON for every call made to OrthoApnea for one order. See `docs/ADR-017-partner-integration-pattern.md`
  for the backend pattern behind it (`partner_link`/`partner_transaction`).
- **Soft-delete/hide** (migration `019_treatment_plan_deleted_at.sql`) — admin-only
  "delete" on an order is actually `deleted_at`, same convention as `patient`'s own soft
  delete. The `partner_link`/`partner_transaction` audit trail survives untouched; only
  list views filter it out.

## Known open items

- Tooltip text/images: ours is still an invented clinical gloss, doesn't match OA's real
  wording. A capture checklist for this was published mid-conversation — check for it
  before writing new tooltip copy from scratch again.
- STL/digital-scan file upload request shape: never captured, still deferred.
- Additional splints dynamic list: implemented with a best-effort field name
  (`additionalSplints`) never confirmed against OA's real raw request body.
