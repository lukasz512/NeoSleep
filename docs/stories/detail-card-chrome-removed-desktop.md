# Detail views: no card chrome

**Type:** trivial UI change (no Linear ticket) · **Date:** 2026-09-24

## Request

The bordered card wrapping every entity detail view (e.g. the HCO "Szpital Kliniczny"
header, tabs and fields) should go — the content sits directly on the page. On mobile
the card's spacing stays, only its visual chrome goes.

## Change

`ItemDetailLayout.vue` — `.view-item__card` has no border, radius or background at any
width.

- Mobile (< 768px): keeps its `24px` padding, so spacing is unchanged.
- Desktop (>= 768px = `MOBILE_BREAKPOINT` in `apps/pwa/src/constants.ts`): padding `0`,
  so content aligns flush with the back-button row.

Applies to every view built on `ItemDetailLayout`: HCO, HCP, Patient, Lead, User detail
and the document content editor.

## Verified

Headless Chrome against the worktree dev server with mocked API responses:
1440px → border `0px`, padding `0px`, transparent; 400px → border `0px`, padding `24px`,
transparent.
