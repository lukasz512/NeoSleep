#!/usr/bin/env bash
# infrastructure/scripts/worktree-clean.test.sh
# Self-test for worktree-clean.sh against a throwaway repo + bare "origin"
# in a temp dir — never touches this repository.
# Usage: pnpm worktree:clean:test
set -uo pipefail

SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/worktree-clean.sh"
SANDBOX="$(mktemp -d)"
trap 'rm -rf "$SANDBOX"' EXIT
FAILS=0

check() {  # check <description> <command...>
  local desc="$1"; shift
  if "$@" >/dev/null 2>&1; then echo "  ok   $desc"; else echo "  FAIL $desc"; FAILS=$((FAILS + 1)); fi
}
status_of() { jq -r --arg b "$1" '.[] | select(.branch == $b) | .status' "$SANDBOX/report.json"; }
is_status() { [ "$(status_of "$1")" = "$2" ]; }

export GIT_AUTHOR_NAME=test GIT_AUTHOR_EMAIL=test@example.com GIT_COMMITTER_NAME=test GIT_COMMITTER_EMAIL=test@example.com

cd "$SANDBOX"
git init -q --bare origin.git
git clone -q origin.git main 2>/dev/null
cd main
git checkout -q -b dev
git commit -q --allow-empty -m init
git push -q origin dev

add_worktree() {  # branch with one own commit, pushed
  git worktree add -q -b "$1" "../wt-$1" dev
  git -C "../wt-$1" commit -q --allow-empty -m "$1 work"
  git -C "../wt-$1" push -q origin "$1"
}
add_worktree merged
add_worktree dirty
add_worktree unmerged
add_worktree locked
git worktree add -q -b fresh ../wt-fresh dev

git merge -q --no-ff merged -m "merge merged"
git merge -q --no-ff dirty -m "merge dirty"
git merge -q --no-ff locked -m "merge locked"
git push -q origin dev
echo scratch > ../wt-dirty/new.txt
git -C ../wt-unmerged commit -q --allow-empty -m "unpushed follow-up"
git worktree lock ../wt-locked

git checkout -q -b remoteonly
git commit -q --allow-empty -m "remote only work"
git push -q origin remoteonly
git checkout -q dev
git merge -q --no-ff remoteonly -m "merge remoteonly"
git push -q origin dev
git branch -q -D remoteonly

echo "report"
"$SCRIPT" --json > "$SANDBOX/report.json"
check "merged + clean worktree is CANDIDATE"          is_status merged CANDIDATE
check "worktree with untracked file is KEEP"          is_status dirty KEEP
check "dirty file is listed"                          test "$(jq -r '.[] | select(.branch=="dirty") | .dirtyFiles[0]' "$SANDBOX/report.json")" = "new.txt"
check "branch with unmerged commit is KEEP"           is_status unmerged KEEP
check "fresh branch without own commits is KEEP"      is_status fresh KEEP
check "locked worktree is KEEP"                       is_status locked KEEP
check "merged remote-only branch is CANDIDATE"        is_status remoteonly CANDIDATE
check "main worktree / dev is not listed"             test -z "$(status_of dev)"
check "--count counts worktree candidates only"       test "$("$SCRIPT" --count)" = "1"
check "dry run removed nothing"                       test -d ../wt-merged

echo "apply"
"$SCRIPT" --apply --delete-remote --no-fetch merged dirty unmerged fresh locked dev remoteonly > "$SANDBOX/apply.log" 2>&1
check "--apply exits non-zero when anything is refused" test $? -ne 0
check "merged worktree removed"                       test ! -d ../wt-merged
check "merged local branch deleted"                   test -z "$(git branch --list merged)"
check "merged remote branch deleted"                  test -z "$(git ls-remote --heads origin merged)"
check "remote-only merged branch deleted"             test -z "$(git ls-remote --heads origin remoteonly)"
check "dirty worktree untouched"                      test -f ../wt-dirty/new.txt
check "dirty remote branch untouched"                 test -n "$(git ls-remote --heads origin dirty)"
check "unmerged worktree untouched"                   test -d ../wt-unmerged
check "fresh worktree untouched"                      test -d ../wt-fresh
check "locked worktree untouched"                     test -d ../wt-locked
check "dev untouched"                                 test -n "$(git ls-remote --heads origin dev)"

echo "apply without --delete-remote keeps the remote branch"
git -C ../wt-dirty clean -fdq
"$SCRIPT" --apply --no-fetch dirty > /dev/null 2>&1
check "worktree removed once clean"                   test ! -d ../wt-dirty
check "remote branch kept"                            test -n "$(git ls-remote --heads origin dirty)"

echo "auto (NEO-84): local branches, squash merges, markers"
# squashed: its commit lands on dev as an identical patch, not by ancestry.
git worktree add -q -b squashed ../wt-squashed dev
echo squash > ../wt-squashed/squash.txt
git -C ../wt-squashed add squash.txt
git -C ../wt-squashed commit -q -m "squashed work"
git -C ../wt-squashed push -q origin squashed
# dev moves first, so the cherry-pick is a new commit with the same patch (a real squash merge).
git commit -q --allow-empty -m "other dev work"
git cherry-pick squashed > /dev/null
git push -q origin dev
mkdir -p ../wt-squashed/.claude/local/artifacts
echo '{"url":"https://claude.ai/artifact/x"}' > ../wt-squashed/.claude/local/artifacts/NEO-1.json
printf '.claude/local/\n' >> .git/info/exclude
# Local branches with no worktree: merged, unmerged, fresh, backup.
git checkout -q -b localmerged dev && git commit -q --allow-empty -m "local merged work" && git checkout -q dev
git merge -q --no-ff localmerged -m "merge localmerged"
git checkout -q -b localunmerged dev && git commit -q --allow-empty -m "local unmerged work" && git checkout -q dev
git branch -q localfresh dev~1
git branch -q backup/dev-snapshot dev~1
git push -q origin dev

"$SCRIPT" --json --no-fetch > "$SANDBOX/report.json"
check "squash-merged worktree is CANDIDATE"          is_status squashed CANDIDATE
check "merged local branch without worktree is CANDIDATE" is_status localmerged CANDIDATE
check "unmerged local branch without worktree is KEEP"    is_status localunmerged KEEP
check "fresh local branch without worktree is CANDIDATE"  is_status localfresh CANDIDATE
check "backup/* branch is not listed"                test -z "$(status_of backup/dev-snapshot)"

"$SCRIPT" --auto --no-fetch > "$SANDBOX/auto.log" 2>&1
check "--auto exits zero"                            test $? -eq 0
check "--auto removed the squash-merged worktree"    test ! -d ../wt-squashed
check "--auto deleted its remote branch"             test -z "$(git ls-remote --heads origin squashed)"
check "--auto kept its Artifact marker"              test -f .claude/local/artifacts/NEO-1.json
check "--auto deleted the merged local branch"       test -z "$(git branch --list localmerged)"
check "--auto deleted the fresh local branch"        test -z "$(git branch --list localfresh)"
check "--auto kept the unmerged local branch"        test -n "$(git branch --list localunmerged)"
check "--auto kept the backup branch"                test -n "$(git branch --list backup/dev-snapshot)"
check "--auto kept the unmerged worktree"            test -d ../wt-unmerged
check "--auto kept the fresh worktree"               test -d ../wt-fresh
check "--auto kept the locked worktree"              test -d ../wt-locked
check "--auto kept dev"                              test -n "$(git ls-remote --heads origin dev)"

if [ "$FAILS" -gt 0 ]; then
  cat "$SANDBOX/auto.log" 2>/dev/null
  echo "$FAILS check(s) failed. Apply log:"; cat "$SANDBOX/apply.log"; exit 1
fi
echo "all checks passed"
