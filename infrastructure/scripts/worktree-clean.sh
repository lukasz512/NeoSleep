#!/usr/bin/env bash
# infrastructure/scripts/worktree-clean.sh
# Lists git worktrees, local branches and merged remote branches that look
# closed, and removes the ones you name — or, with --auto, every one of them.
# See docs/stories/worktree-cleanup.md (NEO-50) and
# docs/stories/ship-rules-ticket-links-index-cleanup.md (NEO-84).
#
# Usage:
#   pnpm worktree:clean                       dry-run report (fetches origin first)
#   pnpm worktree:clean --json                same, as JSON
#   pnpm worktree:clean --count               number of candidates, no fetch (SessionStart hook)
#   pnpm worktree:clean --apply [--delete-remote] <branch>...
#                                             remove the named worktrees + local branches
#                                             (and merged remote branches with --delete-remote)
#   pnpm worktree:clean --auto                remove every CANDIDATE (worktrees, local and
#                                             merged remote branches); SessionStart hook
#   --no-fetch                                skip `git fetch origin --prune`
#
# "Merged" means every commit is on origin/dev — by ancestry, or as an identical
# patch (git cherry: squash/rebase/cherry-pick merges). Anything else is KEEP and
# only listed, never removed. Before a worktree goes, its Artifact markers
# (.claude/local/artifacts/*.json) are copied to the main checkout.
#
# A worktree is a CANDIDATE only when all hold:
#   - it has a branch, is not the main worktree, not the one this runs from, not locked
#   - 0 uncommitted/untracked files
#   - 0 commits not on origin/dev
#   - its tip is NOT on origin/dev's first-parent chain (a fresh, commit-less
#     branch sits there and would otherwise look "merged")
# A local branch with no worktree is a CANDIDATE when it is merged, or when it
# has no own commits at all (nothing to lose). backup/* branches are never touched.
# Nothing here ever uses --force.
set -uo pipefail

BASE="origin/dev"
PROTECTED_BRANCHES="dev prod main"
PROTECTED_PREFIX="backup/"

MODE="report"
JSON=0
FETCH=1
DELETE_REMOTE=0
APPLY_BRANCHES=()

while [ $# -gt 0 ]; do
  case "$1" in
    --json) JSON=1 ;;
    --count) MODE="count"; FETCH=0 ;;
    --apply) MODE="apply" ;;
    --auto) MODE="auto"; DELETE_REMOTE=1 ;;
    --delete-remote) DELETE_REMOTE=1 ;;
    --no-fetch) FETCH=0 ;;
    -h|--help) sed -n '2,33p' "$0"; exit 0 ;;
    -*) echo "Unknown flag: $1" >&2; exit 2 ;;
    *) APPLY_BRANCHES+=("$1") ;;
  esac
  shift
done

if [ "$MODE" != "apply" ] && [ ${#APPLY_BRANCHES[@]} -gt 0 ]; then
  echo "Branch names are only accepted with --apply." >&2
  exit 2
fi
if [ "$MODE" = "apply" ] && [ ${#APPLY_BRANCHES[@]} -eq 0 ]; then
  echo "--apply needs at least one branch name." >&2
  exit 2
fi

git rev-parse --git-dir >/dev/null 2>&1 || { echo "Not inside a git repository." >&2; exit 2; }

if [ "$FETCH" = 1 ]; then
  git fetch origin --prune --quiet || { echo "git fetch origin failed — rerun with --no-fetch to use the last-fetched state." >&2; exit 1; }
fi

git rev-parse --verify --quiet "$BASE" >/dev/null || { echo "$BASE not found — fetch origin first." >&2; [ "$MODE" = "count" ] && echo 0; exit 1; }

S=$'\x1f'  # field separator: tab would collapse empty fields in `read`
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
git rev-list --first-parent "$BASE" > "$TMP/first-parent"

CURRENT_TOP="$(git rev-parse --show-toplevel)"
MAIN_TOP="$(git worktree list --porcelain | awk 'NR==1 && /^worktree /{sub(/^worktree /,""); print; exit}')"

is_protected() {
  case " $PROTECTED_BRANCHES " in *" $1 "*) return 0 ;; esac
  case "$1" in "$PROTECTED_PREFIX"*) return 0 ;; esac
  return 1
}

ticket_of() {
  printf '%s' "$1" | grep -oiE 'neo-[0-9]+' | head -1 | tr '[:lower:]' '[:upper:]'
}

# Why a ref is not safe to drop, or empty if it is. Safe = merged into BASE with own
# commits, either by ancestry or with every own commit already on BASE as an identical
# patch (squash/rebase merges). `allow-fresh` also accepts a ref with no own commits —
# only for a branch with no worktree, where there is no work in progress to protect.
merge_block_reason() {
  local ref="$1" allow_fresh="${2:-}" ahead unique
  ahead="$(git rev-list --count "$BASE..$ref" 2>/dev/null)" || { echo "cannot resolve $ref"; return; }
  if [ "$ahead" -gt 0 ]; then
    # Empty commits all share one patch id, so git cherry would match them to any empty
    # commit on BASE — count them as unique, never as "already merged".
    unique="$(( $(git cherry "$BASE" "$ref" 2>/dev/null | grep -c '^+') + $(git rev-list --no-merges "$BASE..$ref" 2>/dev/null | while read -r c; do git diff-tree --quiet "$c^" "$c" 2>/dev/null && echo "$c"; done | wc -l) ))"
    [ "$unique" -gt 0 ] && echo "$unique commit(s) not on $BASE"
    return
  fi
  [ "$allow_fresh" = "allow-fresh" ] && return
  if grep -qx "$(git rev-parse "$ref")" "$TMP/first-parent"; then echo "no own commits (fresh or unused branch)"; return; fi
}

# Keep a removed worktree's Artifact markers: the quality gate and the artifact index
# read them later from the main checkout. The newer copy wins (markers are rewritten
# on every refresh of their Artifact).
save_markers() {
  local src="$1/.claude/local/artifacts" dst="$MAIN_TOP/.claude/local/artifacts" f
  [ -d "$src" ] || return 0
  mkdir -p "$dst"
  for f in "$src"/*.json; do
    [ -f "$f" ] || continue
    if [ ! -f "$dst/$(basename "$f")" ] || [ "$f" -nt "$dst/$(basename "$f")" ]; then cp -p "$f" "$dst/"; fi
  done
}

# ─── Collect worktrees: path, branch, locked (\x1f-separated) ─────────────────────────
git worktree list --porcelain | awk '
  /^worktree /{ if (p != "") print p "\037" b "\037" l; p=substr($0,10); b=""; l=0 }
  /^branch /  { b=substr($0,8); sub(/^refs\/heads\//,"",b) }
  /^locked/   { l=1 }
  END         { if (p != "") print p "\037" b "\037" l }
' > "$TMP/worktrees"

# classify <path> <branch> <locked>  → prints "status, reason, dirty-files(;-joined)" (\x1f-separated)
classify() {
  local path="$1" branch="$2" locked="$3" dirty reason
  if [ -z "$branch" ]; then printf 'KEEP\037detached HEAD\037\n'; return; fi
  if is_protected "$branch"; then printf 'KEEP\037protected branch\037\n'; return; fi
  if [ "$path" = "$CURRENT_TOP" ]; then printf 'KEEP\037current worktree\037\n'; return; fi
  if [ "$locked" = 1 ]; then printf 'KEEP\037locked\037\n'; return; fi
  if [ ! -d "$path" ]; then printf 'KEEP\037directory missing (run git worktree prune)\037\n'; return; fi
  dirty="$(git -C "$path" status --porcelain 2>/dev/null | sed 's/^...//' | paste -sd ';' -)"
  if [ -n "$dirty" ]; then
    printf 'KEEP\037%s uncommitted file(s)\037%s\n' "$(printf '%s' "$dirty" | awk -F';' '{print NF}')" "$dirty"
    return
  fi
  reason="$(merge_block_reason "refs/heads/$branch")"
  if [ -n "$reason" ]; then printf 'KEEP\037%s\037\n' "$reason"; return; fi
  printf 'CANDIDATE\037merged into %s, clean\037\n' "$BASE"
}

worktree_path_of() {
  awk -F"$S" -v b="$1" '$2==b {print $1; exit}' "$TMP/worktrees"
}

remote_exists() {
  git show-ref --verify --quiet "refs/remotes/origin/$1"
}

# ─── Apply ─────────────────────────────────────────────────────────────────
# apply_branch <branch> — removes its worktree, local branch and (with DELETE_REMOTE) its
# merged remote branch, re-checking safety at every step. Non-zero if anything was refused.
apply_branch() {
  local branch="$1" path locked result reason sha
  echo "── $branch"
  if is_protected "$branch"; then echo "   REFUSED: protected branch"; return 1; fi
  path="$(worktree_path_of "$branch")"
  if [ -n "$path" ] && [ "$path" = "$MAIN_TOP" ]; then echo "   REFUSED: checked out in the main worktree"; return 1; fi

  if [ -n "$path" ]; then
    locked="$(awk -F"$S" -v b="$branch" '$2==b {print $3; exit}' "$TMP/worktrees")"
    result="$(classify "$path" "$branch" "$locked")"
    if [ "$(printf '%s' "$result" | cut -d"$S" -f1)" != "CANDIDATE" ]; then
      echo "   REFUSED: $(printf '%s' "$result" | cut -d"$S" -f2)"; return 1
    fi
    save_markers "$path"
    if git worktree remove "$path"; then echo "   removed worktree $path"; else echo "   FAILED: git worktree remove"; return 1; fi
  fi

  if git show-ref --verify --quiet "refs/heads/$branch"; then
    reason="$(merge_block_reason "refs/heads/$branch" allow-fresh)"
    if [ -n "$reason" ]; then echo "   REFUSED to delete local branch: $reason"; return 1; fi
    # update-ref with the old value only deletes if the branch still points at the commit just verified.
    sha="$(git rev-parse "refs/heads/$branch")"
    if git update-ref -d "refs/heads/$branch" "$sha"; then
      git config --remove-section "branch.$branch" 2>/dev/null
      echo "   deleted local branch (was ${sha:0:7})"
    else
      echo "   FAILED: could not delete local branch"; return 1
    fi
  elif [ -z "$path" ] && ! remote_exists "$branch"; then
    echo "   nothing found for this branch"; return 1
  fi

  if [ "$DELETE_REMOTE" = 1 ] && remote_exists "$branch"; then
    reason="$(merge_block_reason "refs/remotes/origin/$branch")"
    if [ -n "$reason" ]; then echo "   REFUSED to delete origin/$branch: $reason"; return 1; fi
    if git push origin --delete "$branch" --quiet; then echo "   deleted origin/$branch"; else echo "   FAILED: git push origin --delete"; return 1; fi
  fi
  return 0
}

if [ "$MODE" = "apply" ]; then
  rc=0
  for branch in "${APPLY_BRANCHES[@]}"; do
    apply_branch "$branch" || rc=1
  done
  exit "$rc"
fi

# ─── Report / count ────────────────────────────────────────────────────────
: > "$TMP/rows"
while IFS="$S" read -r path branch locked; do
  [ "$path" = "$MAIN_TOP" ] && continue
  result="$(classify "$path" "$branch" "$locked")"
  remote=0; [ -n "$branch" ] && remote_exists "$branch" && remote=1
  printf 'worktree\037%s\037%s\037%s\037%s\037%s\n' "$branch" "$path" "$(ticket_of "$branch")" "$remote" "$result" >> "$TMP/rows"
done < "$TMP/worktrees"

# Local branches with no worktree (left behind by removed worktrees or old sessions).
git for-each-ref --format='%(refname:strip=2)' refs/heads | while read -r lb; do
  is_protected "$lb" && continue
  awk -F"$S" -v b="$lb" '$2==b {found=1} END {exit !found}' "$TMP/worktrees" && continue
  reason="$(merge_block_reason "refs/heads/$lb" allow-fresh)"
  if [ -z "$reason" ]; then status="CANDIDATE"; reason="merged into $BASE (or no own commits)"; else status="KEEP"; fi
  remote=0; remote_exists "$lb" && remote=1
  printf 'local-only\037%s\037\037%s\037%s\037%s\037%s\037\n' "$lb" "$(ticket_of "$lb")" "$remote" "$status" "$reason" >> "$TMP/rows"
done

# Merged remote branches with no worktree or local branch here (e.g. old worker/* branches).
git for-each-ref --format='%(refname:strip=3)' refs/remotes/origin | while read -r rb; do
  [ "$rb" = "HEAD" ] && continue
  is_protected "$rb" && continue
  awk -F"$S" -v b="$rb" '$2==b {found=1} END {exit !found}' "$TMP/worktrees" && continue
  git show-ref --verify --quiet "refs/heads/$rb" && continue
  reason="$(merge_block_reason "refs/remotes/origin/$rb")"
  if [ -z "$reason" ]; then status="CANDIDATE"; reason="merged into $BASE"; else status="KEEP"; fi
  printf 'remote-only\037%s\037\037%s\0371\037%s\037%s\037\n' "$rb" "$(ticket_of "$rb")" "$status" "$reason" >> "$TMP/rows"
done

if [ "$MODE" = "count" ]; then
  awk -F"$S" '$1=="worktree" && $6=="CANDIDATE"' "$TMP/rows" | wc -l | tr -d ' '
  exit 0
fi

if [ "$MODE" = "auto" ]; then
  awk -F"$S" '$6=="CANDIDATE" {print $2}' "$TMP/rows" | sort -u > "$TMP/auto"
  removed=0
  while read -r branch; do
    [ -z "$branch" ] && continue
    apply_branch "$branch" && removed=$((removed + 1))
  done < "$TMP/auto"
  kept="$(awk -F"$S" '$6=="KEEP"' "$TMP/rows" | wc -l | tr -d ' ')"
  echo "auto: cleaned $removed branch(es); kept $kept (unmerged, dirty, locked or fresh — pnpm worktree:clean lists them)"
  exit 0
fi

if [ "$JSON" = 1 ]; then
  jq -R -s '
    split("\n") | map(select(length > 0) | split("\u001f")) | map({
      kind: .[0], branch: .[1], path: (if .[2] == "" then null else .[2] end),
      ticket: (if .[3] == "" then null else .[3] end), remoteExists: (.[4] == "1"),
      status: .[5], reason: .[6],
      dirtyFiles: (if (.[7] // "") == "" then [] else (.[7] | split(";")) end)
    })' "$TMP/rows"
  exit 0
fi

for status in CANDIDATE KEEP; do
  echo
  echo "== $status"
  awk -F"$S" -v s="$status" '$6==s' "$TMP/rows" | sort -t"$S" -k1,1 -k2,2 | while IFS="$S" read -r kind branch path ticket remote st reason dirty; do
    extra=""
    [ -n "$ticket" ] && extra=" [$ticket]"
    [ "$kind" = "remote-only" ] && extra="$extra (remote only)"
    [ "$kind" = "local-only" ] && extra="$extra (local branch, no worktree)"
    [ "$kind" = "worktree" ] && [ "$remote" = 1 ] && extra="$extra (+ origin/$branch)"
    printf '  %-60s %s%s\n' "$branch" "$reason" "$extra"
    [ -n "$dirty" ] && printf '%s\n' "$dirty" | tr ';' '\n' | sed 's/^/      · /'
  done
done
echo
echo "Dry run — nothing removed. Remove every CANDIDATE: pnpm worktree:clean --auto — or pick:"
echo "  pnpm worktree:clean --apply [--delete-remote] <branch>..."
