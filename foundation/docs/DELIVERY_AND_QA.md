# Delivery and QA – handoff process

**Goal:** You receive ready modules, test them, and either accept or list fixes. One visible board ([TASK_BOARD.md](TASK_BOARD.md)) and this process doc define the flow.

## Steps

1. **Dev completes a module** and moves it to **"Ready for QA"** in [TASK_BOARD.md](TASK_BOARD.md). Code is merged or in a PR; tests pass; docs are updated.
2. **You run the app** (e.g. `pnpm start` or `cd apps/website && pnpm dev`) and test using the handoff checklist below.
3. **You either:**
   - **Accept:** Move the item to **"Accepted"** in TASK_BOARD.md, or comment "Accepted" on the PR.
   - **Request fixes:** Move the item to **"Needs fix"** and add a short list of issues (e.g. in TASK_BOARD under the item, or as PR comments). Use short ids like `[W1] Button too small` so we can track.
4. **Dev fixes** and moves the item back to **"Ready for QA"**. Repeat from step 2 until accepted.

## Definition of "Ready for QA"

- Code is merged to the target branch (or in a PR you can run).
- Tests pass (`pnpm ci` or equivalent).
- Relevant docs are updated (PROJECT_STATE, module docs, etc.).
- No known regressions; dev has done a quick smoke test.

## Handoff checklist (for you)

Use this when testing a deliverable.

### Website (marketing site)

- [ ] Hero and nav load; logo and nav links visible.
- [ ] CTAs (Find a Dentist, Learn More, etc.) visible and styled.
- [ ] Green theme applied (primary color, buttons).
- [ ] Stats section and Solutions / For Dentists / For Patients sections present.
- [ ] Final CTA section present.
- [ ] On mobile (or narrow viewport): layout readable; touch targets comfortable (e.g. buttons at least 44px).
- [ ] No console errors in the browser.

### Rep app / Portal / other apps

- [ ] App starts; login or main view loads.
- [ ] No console errors; no broken layout.
- [ ] Changed feature behaves as described in the task.

### General

- [ ] Feedback: either accept or list specific fixes (with id like `[W1]` so we can reference).

## Where to report feedback

- **Option A:** In [TASK_BOARD.md](TASK_BOARD.md): under the item in "Needs fix", add a bullet list (e.g. `- [W1] Button too small on mobile`).
- **Option B:** In a PR comment: list the same items; we will fix and re-request review.

We will move the item back to "Ready for QA" after fixes and you can re-test.

## Orchestrator = board + process

There is no separate app. The **orchestrator** is:

- **TASK_BOARD.md** – the visible list (To do, In progress, Ready for QA, Accepted, Needs fix). We update it as work progresses and when you accept or request fixes.
- **This doc** – the steps and rules above.

Keep the board updated so you always see what is ready for your test and what is waiting on fixes.
