#!/usr/bin/env bash
# infrastructure/scripts/test-db.sh (CORE-150)
# One local Postgres for every worktree's API tests: a single `neo-test-pg`
# container (postgres:15, same as CI) with one database per worktree — instead of
# a container per thread, which piled up to 42 running containers by 2026-10-06.
#
# Usage:
#   pnpm test-db up [name] [--migrate]   start/reuse the container, create the worktree's
#                                        database, write .env if the worktree has none,
#                                        with --migrate also run migrate + sync-test-schema
#   pnpm test-db down [name]             drop the worktree's database; stop the container
#                                        once no worktree database is left
#   pnpm test-db prune [--legacy-hours N]
#                                        drop databases of worktrees that no longer exist and
#                                        remove old per-thread postgres:15 containers running
#                                        longer than N hours (default 72)
#   pnpm test-db dbname [name]           print the database name for a worktree
#   name defaults to the current worktree's directory name.
#
# Never touches Docker Compose containers or anything not started from postgres:15.
# TEST_DB_CONTAINER / TEST_DB_PORT / TEST_DB_ENV_FILE override the defaults (self-test).
set -uo pipefail

CONTAINER="${TEST_DB_CONTAINER:-neo-test-pg}"
PORT="${TEST_DB_PORT:-54329}"
IMAGE="postgres:15"
PREFIX="wt_"

die() { echo "test-db: $*" >&2; exit 1; }

worktree_top() { git rev-parse --show-toplevel 2>/dev/null || pwd; }

# dbname <worktree name> → wt_<lower-case, non-alphanumerics as _>, max 63 chars (Postgres limit).
dbname() {
  local n
  n="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/_/g; s/^_+//; s/_+$//')"
  printf '%s\n' "${PREFIX}${n}" | cut -c1-63
}

have_docker() { command -v docker >/dev/null 2>&1; }

# state → missing | stopped | running
state() {
  local r
  r="$(docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null)" || { echo missing; return; }
  [ "$r" = "true" ] && echo running || echo stopped
}

psql_c() { docker exec "$CONTAINER" psql -U postgres -tAc "$1"; }

worktree_dbs() { psql_c "SELECT datname FROM pg_database WHERE datname LIKE '${PREFIX}%' ORDER BY 1" 2>/dev/null; }

stop_if_unused() {
  if [ -z "$(worktree_dbs)" ]; then
    docker stop "$CONTAINER" >/dev/null && echo "test-db: no worktree database left, stopped $CONTAINER"
  fi
}

cmd_up() {
  local name="$1" migrate="$2" db url env_file i
  have_docker || die "docker not found"
  case "$(state)" in
    missing) docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD=postgres -p "$PORT:5432" "$IMAGE" >/dev/null || die "docker run failed" ;;
    stopped) docker start "$CONTAINER" >/dev/null || die "docker start failed" ;;
  esac
  for i in $(seq 1 30); do
    docker exec "$CONTAINER" pg_isready -U postgres -q >/dev/null 2>&1 && break
    [ "$i" = 30 ] && die "$CONTAINER did not become ready"
    sleep 1
  done
  db="$(dbname "$name")"
  if [ "$(psql_c "SELECT 1 FROM pg_database WHERE datname = '$db'")" != "1" ]; then
    docker exec "$CONTAINER" createdb -U postgres "$db" || die "createdb $db failed"
    echo "test-db: created database $db"
  fi
  url="postgresql://postgres:postgres@localhost:$PORT/$db"

  # Mirrors the CI job env (.github/workflows/ci.yml). Never overwrites an existing .env.
  env_file="${TEST_DB_ENV_FILE:-$(worktree_top)/.env}"
  if [ ! -f "$env_file" ]; then
    cat > "$env_file" <<EOF
DATABASE_URL=$url
DEFAULT_TENANT_SLUG=neosleep
SESSION_SECRET=ci-test-session-secret-not-for-production-use
ORTHOAPNEA_EMAIL=qa-orthoapnea@neosleepcare.com
ORTHOAPNEA_PASSWORD=test-only-not-a-real-credential
EOF
    echo "test-db: wrote $env_file"
  elif ! grep -qx "DATABASE_URL=$url" "$env_file"; then
    echo "test-db: $env_file exists with another DATABASE_URL — left as is. For local tests set DATABASE_URL=$url" >&2
  fi

  if [ "$migrate" = 1 ]; then
    (cd "$(worktree_top)" && DATABASE_URL="$url" pnpm --filter @neo/api migrate && DATABASE_URL="$url" pnpm --filter @neo/api sync-test-schema) || die "migrate failed"
  fi
  echo "$url"
}

cmd_down() {
  local db
  have_docker || return 0
  [ "$(state)" = running ] || return 0
  db="$(dbname "$1")"
  docker exec "$CONTAINER" dropdb -U postgres --if-exists --force "$db" && echo "test-db: dropped $db"
  stop_if_unused
}

cmd_prune() {
  local hours="$1" live db ids
  have_docker || return 0

  if [ "$(state)" = running ]; then
    live="$(git worktree list --porcelain 2>/dev/null | awk '/^worktree /{sub(/^worktree /,""); print}' | while read -r p; do dbname "$(basename "$p")"; done)"
    for db in $(worktree_dbs); do
      printf '%s\n' "$live" | grep -qx "$db" && continue
      docker exec "$CONTAINER" dropdb -U postgres --if-exists --force "$db" && echo "test-db: dropped $db (worktree gone)"
    done
    stop_if_unused
  fi

  # Legacy: one container per thread (<slug>-test-pg). Removed once older than $hours.
  ids="$(docker ps -q --filter "ancestor=$IMAGE" 2>/dev/null)"
  [ -z "$ids" ] && return 0
  # shellcheck disable=SC2086
  docker inspect -f '{{.Name}}|{{.State.StartedAt}}|{{index .Config.Labels "com.docker.compose.project"}}' $ids 2>/dev/null \
    | node -e '
      const [hours, keep] = process.argv.slice(1);
      const lines = require("fs").readFileSync(0, "utf8").split("\n").filter(Boolean);
      for (const line of lines) {
        const [rawName, started, compose] = line.split("|");
        const name = rawName.replace(/^\//, "");
        if (name === keep || compose) continue;
        const ageHours = (Date.now() - Date.parse(started)) / 3_600_000;
        if (ageHours > Number(hours)) console.log(name);
      }' "$hours" "$CONTAINER" \
    | while read -r name; do
        docker rm -f -v "$name" >/dev/null && echo "test-db: removed legacy container $name"
      done
}

SUB="${1:-}"; [ $# -gt 0 ] && shift
NAME=""; MIGRATE=0; HOURS=72
while [ $# -gt 0 ]; do
  case "$1" in
    --migrate) MIGRATE=1 ;;
    --legacy-hours) shift; HOURS="${1:-}"; [[ "$HOURS" =~ ^[0-9]+$ ]] || die "--legacy-hours needs a number" ;;
    -*) die "unknown flag: $1" ;;
    *) NAME="$1" ;;
  esac
  shift
done
[ -n "$NAME" ] || NAME="$(basename "$(worktree_top)")"

case "$SUB" in
  up) cmd_up "$NAME" "$MIGRATE" ;;
  down) cmd_down "$NAME" ;;
  prune) cmd_prune "$HOURS" ;;
  dbname) dbname "$NAME" ;;
  *) sed -n '2,20p' "$0"; exit 2 ;;
esac
