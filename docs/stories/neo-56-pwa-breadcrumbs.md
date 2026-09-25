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
| Back arrow | **Gone on desktop** while there is a record (or one is loading): the record header replaces AppLayout's "← Module" row. It returns only when there is nothing to describe (not found / load error). |
| Phone | AppLayout's app bar keeps "← Module" (NEO-55); the card shows tile + actions on one row and the name on its own full-width row below (Salesforce Mobile layout), with no eyebrow, so nothing is duplicated and even a short name doesn't wrap next to three 56px buttons. |
| Date of birth in the trail | No. It is patient data only (form + details row, as NEO-57 implemented it on `dev`). |
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
- **`usePageHeader.ts` / `AppLayout.vue`:** `provideRecordHeaderClaim` / `useRecordHeaderClaim` — the record header hides AppLayout's desktop page-header row while shown (see the merge section below).
- **Patient date of birth:** `dev`'s NEO-57 implementation (API, form, details row with age). This branch only adds API round-trip tests for it.
- **Tests:**
  - Unit: `ItemDetailLayout.spec.ts` (incl. the claim), `AppBreadcrumbs.spec.ts`, `HCODetailView.spec.ts` (tile icon per org type), `AppLayout.spec.ts`.
  - API: `routes/patient.spec.ts` (date of birth round trip) on real Postgres.
  - Real browsers: `e2e/breadcrumbs.spec.ts` (Chromium/Firefox/WebKit, desktop + phone, DB-free harness).

## Merged with NEO-55 and NEO-57 (2026-09-25)
While this branch was open, NEO-55 (shell relayout) and NEO-57 (clinical-card lists, patient sex/age) landed on `dev`.

**NEO-55:** it moved the back arrow into AppLayout ("← Module" in the desktop page-header row / mobile app bar) and teleports detail actions into that row. Resolution, as Łukasz decided:
- **Desktop:** the record header **replaces** AppLayout's "← Module" row. `ItemDetailLayout` sets `useRecordHeaderClaim()` while it shows the record header, and AppLayout hides its page-header row (`v-show="!isMobile && !recordHeaderClaim"`). The actions render inline in the record header, not teleported.
- **Phone:** AppLayout's app bar keeps "← Module" (NEO-55). The record header shows tile + name + actions and **hides the eyebrow**, so nothing is duplicated.
- **Not found / load error, or views without a record title:** the NEO-55 behaviour is unchanged (AppLayout's arrow, teleported actions).

**NEO-57:** it added `date_of_birth` + `gender` to the patient API, form and details (with age). This branch's own DOB work duplicated it, so `dev`'s version was kept everywhere. Our API validator, form field, details row, `utils/dateOfBirth.ts` and i18n keys are dropped. This branch's DOB API round-trip tests remain and pass against `dev`'s implementation.
