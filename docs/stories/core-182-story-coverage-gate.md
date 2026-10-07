# CORE-182 — Every acceptance criterion is proven by a test, and gaps block

## Story

As Łukasz, I want every acceptance criterion of a ticket to have a test that walks the real user path, so that a screen that looks finished but doesn't save, refresh or show up on the other screens never reaches me for QA.

## Context

- 2026-10-07: 0 of 68 stories in `docs/stories/` had a test mapped to each criterion. The pwa e2e suite (26 specs) checks layout almost everywhere; it barely checks "save → reload → still there".
- The skills told the model to build "the frontend slice" with an API stub (`/dev feat`), and the gate trusted a hand-written `testCoverageMap`.
- Decision (Łukasz, 2026-10-07): blocking from day one, not report-only for two weeks (changes decision D2 of form core-175-decisions).

## Decided

- Story ↔ ticket: `docs/stories/<ticket>-<slug>.md`, or the ticket id in the story's first heading.
- Criteria: top-level list items under any heading containing "Acceptance", numbered AC1..n; `AC7: …` sets the number.
- Tag: `@<TICKET> ACn` in the test title (`@NEO-9 AC1 AC3` for several).
- Real-backend e2e: an `apps/pwa/e2e` spec that loads no `/e2e/harness/` page and stubs no `/api` route.
- Needs: a UI change → a story, every criterion tested, one real-backend e2e. API route or migration → a story, every criterion tested. Anything else → every criterion tested if the ticket has a story.
- Old stories aren't backfilled: they only show in the report until someone works on their ticket again.

## Acceptance criteria

- [ ] The script lists each story's criteria with the tests tagged for them, and finds a ticket's story by file name or first heading.
- [ ] A branch whose ticket has an untested criterion (or a UI change without a real-backend e2e, or a feature change without a story) fails pre-push, CI and the handover, with the missing ACs named; `dev` and branches without a ticket are report-only.
- [ ] CI writes one row per story (covered/total) to the job summary.
- [ ] The ship-artifact page shows the ticket's criteria → tests table, gaps marked, and fills the marker's `testCoverageMap` from it.

## Follow-ups

- Replace the ~19 pwa tests that assert source strings instead of behavior (ticket created alongside).
