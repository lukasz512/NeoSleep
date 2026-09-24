# Detail views: no card chrome on desktop

**Type:** trivial UI change (no Linear ticket) · **Date:** 2026-09-24

## Request

On desktop, the bordered card wrapping every entity detail view (e.g. the HCO
"Szpital Kliniczny" header, tabs and fields) should go — the content sits directly on
the page.

## Change

`ItemDetailLayout.vue` — `.view-item__card` at `min-width: 768px` (= `MOBILE_BREAKPOINT`
in `apps/pwa/src/constants.ts`): no border, no radius, no padding, transparent
background. The content now aligns flush with the back-button row.

Applies to every view built on `ItemDetailLayout`: HCO, HCP, Patient, Lead, User detail
and the document content editor.

Mobile (< 768px) keeps the card unchanged.

## Verified

Headless Chrome against the worktree dev server with mocked API responses:
1440px → `border 0px`, `padding 0px`, transparent; 400px → `1px` border, `24px` padding.
