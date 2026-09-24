# Detail views: borderless card

**Type:** trivial UI change (no Linear ticket) · **Date:** 2026-09-24

## Request

The card wrapping every entity detail view (e.g. the HCO "Szpital Kliniczny" header,
tabs and fields) should lose its border — but stay a card: its padding, radius and
surface keep the spacing around the content, on desktop and mobile alike.

Two intermediate attempts on this branch removed the card entirely (desktop, then
mobile); both were rejected because the spacing the card provided was lost.

## Change

`ItemDetailLayout.vue` — `.view-item__card` keeps `padding: 24px`, `border-radius` and
surface background at every width; the `border` declaration is removed.

Applies to every view built on `ItemDetailLayout`: HCO, HCP, Patient, Lead, User detail
and the document content editor.

## Verified

Headless Chrome against the worktree dev server with mocked API responses, at 1440px and
400px: border `0px`, padding `24px`, surface background.
