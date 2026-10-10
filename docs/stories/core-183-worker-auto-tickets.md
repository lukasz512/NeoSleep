# CORE-183 — linear-worker takes routine non-UI tickets labelled `auto`

## Story

As Łukasz, I want to label routine backend/tooling tickets `auto` and have the worker ship them on its own, so my interactive session (the most expensive one) is spent on UI and product work.

## Decided

- Board (CORE-187, merged meanwhile): the worker's queue is `approved` cards; label `auto` marks the routine non-UI ones. One FIFO queue by creation date; `ci-failed` still goes first.
- "Non-UI" uses the same rule as the hooks (`.claude/hooks/lib/change-shape.sh`): no `.vue/.css/.scss`, view, API route or migration. The script reads the regex from that file, so they can't drift.
- An `auto` ticket skips `/enrich-user-story`: its `## Done when` is the spec.
- Handover = the light one (Linear comment + PR link, Needs Review). No Artifact page.
- If the diff turns out to be UI: nothing is pushed and the worker leaves a `Blocked:` comment with the card in `building` (the board lets the agent neither change labels nor move it out of `building` except to `needs_review`/`approved`).
- The label `auto` is a free-text board label, set by Łukasz on the card (it also exists in Linear, read-only now).

## Acceptance criteria

- [ ] The worker picks `approved` cards FIFO, `auto`-labelled ones in auto mode, with `ci-failed` first.
- [ ] The worker refuses (a `Blocked:` comment saying why, nothing pushed) when an `auto` card's diff touches UI, a view, an API route or a migration.
- [ ] A dry run of an `auto` ticket goes claim → scope check → implement → self-check → guard → push → CI wait → light handover → needs_review, without an Artifact page.
