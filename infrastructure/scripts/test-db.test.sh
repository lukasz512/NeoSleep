#!/usr/bin/env bash
# infrastructure/scripts/test-db.test.sh (CORE-150)
# Self-test for test-db.sh against a fake `docker` on PATH that keeps its state in
# files — never touches a real container.
# Usage: pnpm test-db:test
set -uo pipefail

SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/test-db.sh"
SANDBOX="$(mktemp -d)"
trap 'rm -rf "$SANDBOX"' EXIT
FAILS=0

check() {  # check <description> <command...>
  local desc="$1"; shift
  if "$@" >/dev/null 2>&1; then echo "  ok   $desc"; else echo "  FAIL $desc"; FAILS=$((FAILS + 1)); fi
}
logged() { grep -q -- "$1" "$FAKE/log"; }
not_logged() { ! logged "$1"; }
not() { ! "$@"; }
has_db() { grep -qx "$1" "$FAKE/dbs"; }

# ─── Fake docker ───────────────────────────────────────────────────────────
export FAKE="$SANDBOX/fake"
mkdir -p "$FAKE/bin"
cat > "$FAKE/bin/docker" <<'EOF'
#!/usr/bin/env bash
echo "docker $*" >> "$FAKE/log"
case "$1" in
  inspect)
    if [ "$2" = "-f" ] && [ "$3" = "{{.State.Running}}" ]; then
      [ -f "$FAKE/state" ] || exit 1
      [ "$(cat "$FAKE/state")" = running ] && echo true || echo false
    else
      cat "$FAKE/legacy"   # name|startedAt|composeProject
    fi ;;
  run) echo running > "$FAKE/state" ;;
  start) echo running > "$FAKE/state" ;;
  stop) echo stopped > "$FAKE/state" ;;
  ps) [ -s "$FAKE/legacy" ] && echo "id1 id2 id3" ;;
  rm) shift 3; echo "$1" >> "$FAKE/removed" ;;
  exec)
    shift 2
    case "$1" in
      pg_isready) exit 0 ;;
      createdb) echo "${@: -1}" >> "$FAKE/dbs" ;;
      dropdb) db="${@: -1}"; grep -vx "$db" "$FAKE/dbs" > "$FAKE/dbs.new"; mv "$FAKE/dbs.new" "$FAKE/dbs" ;;
      psql)
        q="${@: -1}"
        case "$q" in
          *"datname = '"*) db="${q#*datname = \'}"; db="${db%\'}"; grep -qx "$db" "$FAKE/dbs" && echo 1 ;;
          *) sort "$FAKE/dbs" ;;
        esac ;;
    esac ;;
esac
exit 0
EOF
chmod +x "$FAKE/bin/docker"
export PATH="$FAKE/bin:$PATH"
reset() { rm -f "$FAKE/state" "$FAKE/log" "$FAKE/removed"; : > "$FAKE/dbs"; : > "$FAKE/legacy"; touch "$FAKE/log" "$FAKE/removed"; }

export GIT_AUTHOR_NAME=test GIT_AUTHOR_EMAIL=test@example.com GIT_COMMITTER_NAME=test GIT_COMMITTER_EMAIL=test@example.com
cd "$SANDBOX"
git init -q repo && cd repo && git commit -q --allow-empty -m init
git worktree add -q -b worktree-core-150-x ../core-150-shared-db
export TEST_DB_ENV_FILE="$SANDBOX/env"

echo "database names"
check "worktree name → wt_ + underscores"            test "$(bash "$SCRIPT" dbname core-150-151-Lighter.dev)" = "wt_core_150_151_lighter_dev"
check "capped at 63 characters"                       test "$(bash "$SCRIPT" dbname "$(printf 'a%.0s' $(seq 1 80))" | wc -c | tr -d ' ')" = "64"

echo "up"
reset
bash "$SCRIPT" up core-150-shared-db > "$SANDBOX/out"
check "no container → one postgres:15 on 54329"       logged "docker run -d --name neo-test-pg -e POSTGRES_PASSWORD=postgres -p 54329:5432 postgres:15"
check "creates the worktree database"                 has_db wt_core_150_shared_db
check "prints the DATABASE_URL"                       grep -qx "postgresql://postgres:postgres@localhost:54329/wt_core_150_shared_db" "$SANDBOX/out"
check "writes a CI-style .env when there is none"     grep -qx "DATABASE_URL=postgresql://postgres:postgres@localhost:54329/wt_core_150_shared_db" "$TEST_DB_ENV_FILE"
: > "$FAKE/log"
bash "$SCRIPT" up neo-1-other >/dev/null 2>&1
check "second worktree reuses the container"          not_logged "docker run"
check "…and gets its own database"                    has_db wt_neo_1_other
check "an existing .env is never overwritten"         grep -q "wt_core_150_shared_db" "$TEST_DB_ENV_FILE"
echo stopped > "$FAKE/state"; : > "$FAKE/log"
bash "$SCRIPT" up neo-1-other >/dev/null 2>&1
check "stopped container is started, not recreated"   logged "docker start neo-test-pg"
check "existing database is not created twice"        test "$(grep -c wt_neo_1_other "$FAKE/dbs")" = 1

echo "down"
bash "$SCRIPT" down neo-1-other >/dev/null
check "drops only that worktree's database"           test "$(cat "$FAKE/dbs")" = "wt_core_150_shared_db"
check "container keeps running while a DB is left"    test "$(cat "$FAKE/state")" = running
bash "$SCRIPT" down core-150-shared-db >/dev/null
check "last database gone → container stopped"        test "$(cat "$FAKE/state")" = stopped
reset
check "no container → down is a quiet no-op"          bash "$SCRIPT" down whatever

echo "prune"
reset
echo running > "$FAKE/state"
printf '%s\n' wt_core_150_shared_db wt_neo_9_gone > "$FAKE/dbs"
old="2026-01-01T00:00:00Z"; young="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
printf '%s\n' "/neo27-test-pg|$old|" "/neo250-test-pg|$young|" "/neo-test-pg|$old|" "/compose-db|$old|neosleep" > "$FAKE/legacy"
bash "$SCRIPT" prune >/dev/null
check "drops the DB of a removed worktree"            not has_db wt_neo_9_gone
check "keeps the DB of an existing worktree"          has_db wt_core_150_shared_db
check "removes an old per-thread container"           grep -qx neo27-test-pg "$FAKE/removed"
check "keeps a young per-thread container"            not grep -qx neo250-test-pg "$FAKE/removed"
check "never removes the shared container"            not grep -qx neo-test-pg "$FAKE/removed"
check "never removes a Compose container"             not grep -qx compose-db "$FAKE/removed"

echo "without docker"
check "down/prune are no-ops without docker"          env PATH=/usr/bin:/bin bash "$SCRIPT" prune

echo
if [ "$FAILS" -gt 0 ]; then echo "$FAILS check(s) failed"; exit 1; fi
echo "all checks passed"
