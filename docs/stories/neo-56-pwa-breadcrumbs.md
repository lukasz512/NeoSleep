# NEO-56: Medical-grade breadcrumbs on detail views

**Linear:** NEO-56
**Decided by:** Łukasz, over two rounds on 2026-09-25.
- **Proposal:** https://claude.ai/artifact/7dqKz9MZdES7gSTiFyRE8v
- **Round 1** placed the breadcrumbs "w wierszu za strzałką", in the card's existing header row.
- **Round 2** swapped the desktop and phone behaviour and raised the breadcrumbs to medical grade.

## Story
As a field user on a record's detail page, I want to know *whose* record I am in (name, second identifier, anything unusual about its state) and where it sits in the app, before I read anything else. I also want one tap back to the list.

## Decisions
| Question | Answer |
|---|---|
| Desktop | Breadcrumbs **instead of** the back arrow. The parent crumb is the way back. |
| Phone (<768px, `MOBILE_BREAKPOINT`) | Back arrow **only**. The record name is the large title right below it. |
| Hierarchy | Module only: `Patients › Jan Kowalski`. No care-context path (clinic › doctor). Hierarchy, never click history. |
| Second identifier | **Date of birth** for patients. The `identities.date_of_birth` column already existed but was not in the API or the form, so both were added. |
| Active tab in the trail | Yes, as the last crumb (current page). On another tab, the record crumb switches back to the first tab. |
| Entity icons | The module icon on the parent crumb and the record avatar on the record crumb. |
| Status | A small chip, **only for an exceptional state**: patient follow-up/discharged, HCP invited/pending/inactive, HCO not active, user inactive/suspended. The normal state shows nothing. |
| Stability & a11y | Skeleton while loading (the row height doesn't change). Long names ellipsize with the full name + identifier in a tooltip. 44px touch targets. Visible focus ring. `<nav aria-label>` + `<ol>` with `aria-current="page"`. Real-browser tests on 3 engines. |

## Behaviour
| Route | Desktop (≥768px) | Phone |
|---|---|---|
| `/patients/:id` | 👤 Patients › (JK) Jan Kowalski · Mar 12, 1968 [Follow-up] › Notes | ← |
| `/hcp/:id`, `/hco/:id`, `/users/:id` | Module › (avatar) Name [status if exceptional] › Tab | ← |
| `/leads/:id` | Leads › (MW) Maria Wiśniewska (the existing inline title) | ← (MW) Maria Wiśniewska |
| `/documents/:templateKey/:locale` | Documents › Template › Language | ← |
| Loading | Module › ▭ (skeleton, `aria-busy`) | ← |
| Not found / load error | ← (arrow on every width; no record to describe) | ← |

## Date of birth
- **Storage and format:** stored as a plain calendar date. The API reads it with `to_char(..., 'YYYY-MM-DD')`, so it can never shift a day in a negative-offset timezone (MX). There is a test for this under `TZ=America/Mexico_City`.
- **Validation:** API `parseDateOfBirth` and the form rule `dateOfBirthRule` both require a real date, not in the future and not before 1900. Empty means no date.
- **Display:** the month is spelled out ("12 mar 1968" / "Mar 12, 1968"). A numeric 03/12/1968 reads as two different dates across en vs pl/mx, and a wrong-patient mix-up is exactly what a second identifier exists to prevent.
- **Audit:** not written to `audit_log.entity_before/after`. The patient audit entries only carry status/region by design, to keep PHI out of the log.
- **Known limitation:** the shared FormRenderer drops blank fields from the payload. Clearing the date in the edit form therefore leaves the stored value, the same as every other optional patient field. The API itself supports `date_of_birth: null` to clear it.

## Implementation
- **`AppBreadcrumbs.vue` + `AppBreadcrumbs.types.ts`:** the generic trail component.
- **`ItemDetailLayout.vue`:** derives the parent crumb (nav title + icon) from `backRoute` and takes the rest via `breadcrumbs`. It also does the CSS swap at 768px.
- **`useDetailBreadcrumbs.ts`:** builds `record › active tab` for the tabbed detail views.
- **`utils/dateOfBirth.ts`:** `formatDateOfBirth`, `dateOfBirthRule`.
- **API:** `date_of_birth` on the `Patient` DTO, create/PATCH, and validation in `commands/patient.ts`.
- **Tests:**
  - Unit: `AppBreadcrumbs.spec.ts`, `ItemDetailLayout.spec.ts`, `useDetailBreadcrumbs.spec.ts`, `dateOfBirth.spec.ts`, `commands/patientDateOfBirth.spec.ts`.
  - Real Postgres: `routes/patient.spec.ts`.
  - Real browsers: `e2e/breadcrumbs.spec.ts` (Chromium/Firefox/WebKit, DB-free harness `e2e/harness/breadcrumbs.*`).

## Follow-ups
- NEO-55 (shell relayout, unmerged) reworks the same header row. Expect a merge conflict; the two designs are compatible.
- The native date input's display format follows the browser's locale, not the app language.
