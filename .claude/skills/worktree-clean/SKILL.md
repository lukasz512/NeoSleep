---
name: worktree-clean
description: Reviews and removes closed git worktrees and their merged branches (local + origin) — lists candidates with pnpm worktree:clean, confirms each ticket-bearing branch's Linear ticket is Done, then removes only what passes. Use when asking to clean up worktrees, free disk space from .claude/worktrees, delete merged/stale branches, or when the SessionStart hook reports closed worktrees.
argument-hint: "[--keep-remote]"
---

# Worktree Clean

> **Focus**: $ARGUMENTS — `--keep-remote` skips deleting branches on origin; empty means the normal flow.

Removes worktrees and branches that are really finished — nothing else. Rules and reasoning: [docs/stories/worktree-cleanup.md](../../../docs/stories/worktree-cleanup.md) (NEO-50). The script does every git check itself; this skill adds the one check the script can't do (Linear status) and the confirmation step.

## Step 1 — List

```bash
pnpm -s worktree:clean --json
```

This fetches `origin --prune` first. Each entry has `kind` (`worktree` | `remote-only`), `branch`, `path`, `ticket` (`NEO-<n>` or null), `remoteExists`, `status` (`CANDIDATE` | `KEEP`), `reason`, `dirtyFiles`.

Only `CANDIDATE` entries go further. Never try to "rescue" a `KEEP` entry (no stashing, no committing, no `--force`) — dirty or unmerged work is Łukasz's to decide on.

## Step 2 — Linear check

For every `CANDIDATE` with a non-null `ticket`, call `get_issue` on it (one call per distinct ticket — `NEO-18` can cover two branches). The branch passes only when the ticket's status **type** is `completed`. Anything else — `Needs Review`, `In Progress`, `Blocked`, `Canceled`, ticket not found — drops the branch to "kept: ticket not Done (<status>)".

Candidates with `ticket: null` pass on git conditions alone.

## Step 3 — Confirm

Show Łukasz one compact table, grouped: **will remove** (branch, ticket + status, what goes: worktree / local branch / `origin/<branch>`), **kept** (branch + reason, including dirty file lists so forgotten work is visible — e.g. an uncommitted ADR). Then ask with `AskUserQuestion`:

- remove everything listed (worktrees + local branches + origin branches)
- remove locally only (keep origin branches) — same as `--keep-remote`
- let me pick

Deleting branches on origin is outward-facing — never pass `--delete-remote` without this answer, even if a previous run in the same session was approved.

## Step 4 — Apply

```bash
pnpm -s worktree:clean --apply --no-fetch [--delete-remote] <branch> <branch> ...
```

`--apply` re-checks every git condition per branch right before removing it and prints `REFUSED: <reason>` for anything that changed since Step 1 — report those as kept, don't retry them. It never uses `--force`; `git worktree remove` itself also refuses unclean worktrees.

## Step 5 — Report

One short summary: what was removed, how much disk came back (`du -sh .claude/worktrees` before/after), and the kept list with reasons. If kept entries include uncommitted docs/code in merged worktrees, name them explicitly — they are the easiest things to lose track of.

## Notes

- The worktree this session runs in is always kept (`current worktree`). Locked worktrees (`git worktree lock`, used by active Claude Code sessions) are always kept.
- "Merged" means the branch tip is reachable from `origin/dev` *and* is not on dev's first-parent chain — a branch created from dev with no commits of its own looks merged by reachability alone, so it's kept as "no own commits (fresh or unused branch)". Remove those by hand if they're abandoned.
- Squash-merged branches aren't detected as merged (their commits aren't on dev) — they stay `KEEP` with "N commit(s) not on origin/dev". This repo merges PRs with merge commits, so that's rare.
- Self-test: `pnpm worktree:clean:test` (throwaway repo in a temp dir).

## Delegation

| Trigger | Delegate to |
|---|---|
| A kept worktree holds uncommitted work that should land | `/dev` in that worktree |
| Branch-protection / ruleset rejects `git push --delete` | `/devops` |
