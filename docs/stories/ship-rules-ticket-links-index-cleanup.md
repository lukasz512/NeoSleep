# Ship rules: ticket for every change, 3 links, change index, auto-cleanup (NEO-84)

**Asked by Łukasz, 2026-09-26**, after a cleanup session found 30 worktrees and ~50 local branches, most of them long merged.

## Story

As the person who reviews every change after a Claude session, I want each change to have its own short ticket and one Artifact with the same fixed links, all listed in one place, so I can find and judge any change quickly without reading filler. Finished worktrees and branches should disappear by themselves.

## Decisions (answered 2026-09-26)

| Question | Answer |
|---|---|
| Which 3 links are always there? | Artifact (claude.ai), Linear ticket, VS Code session (`vscode://…?session=<id>`); the PR button comes on top of those |
| "List of artifacts"? | One shared **NeoSleep Change Index** Artifact (one line per ticket) **and** shorter per-change Artifacts |
| Ticket for trivial changes too? | Yes, always — replaces "trivial fixes don't need one" |
| Cleanup after merge? | Automatic for merged work; unmerged is only listed |

## Acceptance criteria

1. A branch with changes and no `neo-<n>` in its name fails the quality gate.
2. A new Linear ticket that isn't `## Problem` / `## Change` / `## Done when` in ≤ 1500 characters is rejected before it is created.
3. `build.mjs render` refuses content over the limits (headline 110 chars, summary 2 sentences / 320 chars, list sizes) and a branch without a ticket.
4. The Artifact and the Linear comment carry Artifact, Linear and VS Code links; the marker records `linearUrl`, `vscodeUrl` and `indexed`, and the gate checks them.
5. `finalize` upserts the ticket's line in the shared index; `build.mjs index` renders the index page.
6. `worktree-clean.sh --auto` removes merged worktrees, merged or commit-less local branches and merged origin branches (squash merges included), copies Artifact markers to the main checkout, and never touches unmerged, dirty, locked, `backup/*` or empty-commit branches.
7. Every session start runs `--auto` in the background and reports the previous run.
8. Claude may run `pnpm worktree:clean` without a prompt; raw `git branch -D` stays gated.

## Five angles (enrich-user-story, short)

- **User (Łukasz):** less to read, one place to look, no manual cleanup.
- **Client/tenant, patient:** no effect — tooling only, nothing in `apps/`.
- **Platform:** safety is in the script (every removal re-checks "all commits on origin/dev"), not in the prompt; `backup/*` and locked worktrees are never removed.
- **Compliance:** no data involved. Deleting merged branches loses no history — the commits stay on `dev`.

## Out of scope

- Auto-closing Linear tickets (still Łukasz's call).
- Deleting unmerged branches (listed only).
