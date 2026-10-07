# CORE-183 — linear-worker takes routine non-UI tickets labelled `auto`

## Story

As Łukasz, I want to label routine backend/tooling tickets `auto` and have the worker ship them on its own, so my interactive session (the most expensive one) is spent on UI and product work.

## Decided

- Trigger: label `auto` on a ticket in Backlog/Todo, alongside the existing `Ready for Worker` status. One FIFO queue by creation date; `ci-failed` still goes first.
- "Non-UI" uses the same rule as the hooks (`.claude/hooks/lib/change-shape.sh`): no `.vue/.css/.scss`, view, API route or migration. The script reads the regex from that file, so they can't drift.
- An `auto` ticket skips `/enrich-user-story`: its `## Done when` is the spec.
- Handover = the light one (Linear comment + PR link, Needs Review). No Artifact page.
- If the diff turns out to be UI: nothing is pushed, the worker comments why, removes `auto` and moves the ticket back to Todo.
- The label `auto` is workspace-wide, so CORE and NEO both have it.

## Acceptance criteria

- [ ] The worker picks an `auto` ticket in Backlog/Todo FIFO next to `Ready for Worker` tickets, with `ci-failed` first.
- [ ] The worker refuses (comments why, removes `auto`, back to Todo, pushes nothing) when the diff touches UI, a view, an API route or a migration.
- [ ] A dry run of an `auto` ticket goes claim → scope check → implement → self-check → guard → push → CI wait → light handover → Needs Review, without an Artifact page.
