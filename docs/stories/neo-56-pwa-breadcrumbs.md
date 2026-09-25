# NEO-56: Record header with breadcrumb (Salesforce Lightning / Veeva pattern)

**Linear:** NEO-56
**Decided by:** Łukasz, 2026-09-25, after three rounds:

1. **Round 1:** crumbs after the ← arrow in the card's header row.
2. **Round 2:** "medical grade": desktop trail with avatar, date of birth, status and tab; arrow on phones.
3. **Round 3 (current):** rejected round 2's trail ("ta data i status odpadają"), compared 4 popular patterns (https://claude.ai/artifact/Kw5EZnheAiHDzZHSipjgts: NHS, Salesforce/Veeva, Apple, Jira), and **picked B: Salesforce Lightning / Veeva record header**.

## Story
As a field user on a record's detail page, I want to see at a glance what kind of record this is and whose it is, and to get back to its list in one tap, without navigation noise competing with the clinical data.

## Decisions (round 3)
| Question | Answer |
|---|---|
| Pattern | **Record header**: a tile with the module icon, the parent list as a small uppercase eyebrow link (`PACJENCI ›`) above the record's name (the only h1), and actions on the right. |
| Back arrow | **Gone** while there is a record (or one is loading). It returns only when there is nothing to describe (not found / load error). |
| Phone | **The same block**. The actions sit on the eyebrow row and the name gets its own full-width row below (Salesforce Mobile layout), so even a short name doesn't wrap next to three 56px buttons. |
| Date of birth in the trail | No. It stays as patient data: form field + first details row (API support from round 2 kept). |
| Status in the trail | No. The existing badges keep their old place next to the name (HCP "invited", HCO type/status chips). |
| Active tab in the trail | No. The highlighted tab pill right below says it. |
| Current page in the trail | No. The h1 is the current page, so the eyebrow lists ancestors only (NHS/GOV.UK rule). |
| Name length | Never truncated (it is the record's identity); it wraps. |

## Medical-grade properties
- **Identity:** one source of identity (the h1). The tile tells the record type apart (patient / doctor / clinic, including the org-type icon for clinics, NEO-18).
- **Touch target:** the eyebrow link has a 44px-tall hit area via a pseudo-element, so the small line doesn't grow.
- **Accessibility:** focus ring, `<nav aria-label>` + `<ol>`.
- **Loading:** tile + eyebrow + a placeholder bar. The header reserves the actions' 56px, so nothing jumps when the record arrives.
- **Width:** no horizontal scroll at 390px or 1024px, even for a very long name.

## Implementation
- **`ItemDetailLayout.vue`:**
  - New `recordTitle` prop. It switches the header to the record header; views pass it (`''` while loading).
  - `recordIcon` overrides the tile icon (HCO org type).
  - `title-extra` slot for badges next to the name.
  - The parent crumb (label + icon) is derived from `backRoute`'s nav title.
- **`AppBreadcrumbs.vue`:** the eyebrow trail (ancestor links only, each followed by ›).
- **Views:** patient, HCP, HCO, user, lead and document editor pass `record-title`. Their own avatar + h1 title slots are removed. The document editor's `#title` slot was dead before, because the body slot wins; its name now shows in the header.
- **Patient date of birth:**
  - API read/create/PATCH + validation (real date, not future, ≥1900). `to_char` keeps it a calendar date, so no MX day-shift.
  - PWA: form field and the first details row. The month is spelled out (`utils/dateOfBirth.ts`).
  - Clearing it in the edit form keeps the old value, because the shared FormRenderer drops blank fields (same as every optional patient field).
- **Tests:**
  - Unit: `ItemDetailLayout.spec.ts`, `AppBreadcrumbs.spec.ts`, `HCODetailView.spec.ts` (tile icon per org type), `dateOfBirth.spec.ts`.
  - API: `routes/patient.spec.ts` and `commands/patientDateOfBirth.spec.ts` on real Postgres.
  - Real browsers: `e2e/breadcrumbs.spec.ts` (Chromium/Firefox/WebKit, desktop + phone, DB-free harness).

## Follow-ups
- NEO-55 (shell relayout, unmerged) reworks the same header area. Expect a merge conflict. B already puts the module name into the card, which is what NEO-55 wants.
