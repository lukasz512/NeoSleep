---
name: worktree-clean
description: Cleans up git worktrees and branches — merged ones go automatically (pnpm worktree:clean --auto, also run at every session start); this skill reports what's left (unmerged, dirty, locked) so Łukasz can decide on it. Use when asking to clean up worktrees, free disk space from .claude/worktrees, delete merged/stale branches, or to see what cleanup kept and why.
argument-hint: "[--keep-remote]"
---

# Worktree Clean

> **Focus**: $ARGUMENTS — `--keep-remote` skips deleting branches on origin; empty means the normal flow.

Removes worktrees and branches that are really finished — nothing else. Rules and reasoning: [docs/stories/worktree-cleanup.md](../../../docs/stories/worktree-cleanup.md) (NEO-50) and [docs/stories/ship-rules-ticket-links-index-cleanup.md](../../../docs/stories/ship-rules-ticket-links-index-cleanup.md) (NEO-84).

**Since NEO-84 (2026-09-26) merged work is removed without asking** — Łukasz's decision: a branch whose commits are all on `origin/dev` loses nothing when it goes. The SessionStart hook runs `worktree-clean.sh --auto` in the background (log: `.claude/local/worktree-clean.log`). The Linear "Done" check is gone: a ticket in Needs Review still has its code on dev, and a follow-up starts from a fresh worktree. What this skill is for now is the **KEEP** list.

## Step 1 — List

```bash
pnpm -s worktree:clean --json
```

This fetches `origin --prune` first. Each entry has `kind` (`worktree` | `local-only` | `remote-only`), `branch`, `path`, `ticket` (`NEO-<n>` or null), `remoteExists`, `status` (`CANDIDATE` | `KEEP`), `reason`, `dirtyFiles`.

Only `CANDIDATE` entries go further. Never try to "rescue" a `KEEP` entry (no stashing, no committing, no `--force`) — dirty or unmerged work is Łukasz's to decide on.

## Step 2 — Remove the merged ones

```bash
pnpm -s worktree:clean --auto --no-fetch
```

Removes every `CANDIDATE` (worktree, local branch, merged origin branch), re-checking each step and copying Artifact markers to the main checkout first. Pass `--keep-remote` → use `--apply` without `--delete-remote` on the candidate branches instead.

## Step 3 — The KEEP list

Show Łukasz the `KEEP` entries grouped by reason — unmerged commits (with ticket + Linear status), dirty files (list them: forgotten ADRs/docs are the easiest thing to lose), locked (an open session — leave it). For each unmerged one, recommend: open a PR, park it (keep), or drop it. Never "rescue" a `KEEP` entry yourself (no stashing, no `--force`); deleting unmerged work is his call, done with `--apply` on the branches he names — and still refused by the script if it isn't merged, so a real drop needs his explicit go-ahead for `git branch -D` / `git push origin --delete`.

## Step 5 — Report

One short summary: what was removed, how much disk came back (`du -sh .claude/worktrees` before/after), and the kept list with reasons. If kept entries include uncommitted docs/code in merged worktrees, name them explicitly — they are the easiest things to lose track of.

## Notes

- The worktree this session runs in is always kept (`current worktree`). Locked worktrees (`git worktree lock`, used by active Claude Code sessions) are always kept.
- "Merged" for a worktree means the branch tip is reachable from `origin/dev` *and* is not on dev's first-parent chain — a fresh worktree with no commits of its own may be work about to start, so it's kept as "no own commits (fresh or unused branch)".
- Squash/rebase/cherry-pick merges are detected: a commit whose identical patch is on dev counts as merged (`git cherry`). Empty commits never count as merged (they all share one patch id).
- Local branches without a worktree are covered too; one with no own commits is removed (nothing to lose). `backup/*` is never touched.
- Self-test: `pnpm worktree:clean:test` (throwaway repo in a temp dir).

## Delegation

| Trigger | Delegate to |
|---|---|
| A kept worktree holds uncommitted work that should land | `/dev` in that worktree |
| Branch-protection / ruleset rejects `git push --delete` | `/devops` |
