#!/usr/bin/env bash
# infrastructure/scripts/sandbox.sh
#
# Starts (or tears down) a full local dev stack for the CURRENT worktree —
# apps/api + apps/pwa + apps/web — and exposes pwa/web via a Cloudflare
# Tunnel quick-tunnel, so a change can be reviewed from a real URL (any
# device, no localhost access needed) before opening a PR.
#
# Usage:
#   pnpm sandbox        (= infrastructure/scripts/sandbox.sh up)
#   pnpm sandbox:down   (= infrastructure/scripts/sandbox.sh down)
#
# Safe to run from several worktrees at once: every port and every piece of
# state is derived from this worktree's own root path (same hashing
# technique .claude/hooks/quality-gate.sh already uses for its tmpdir), so
# two worktrees never collide.
#
# NOTE: Google login does not work through the tunnel — apps/api/src/auth.ts's
# OAuth redirect_uri is a fixed, pre-registered origin, and can't match a
# trycloudflare.com URL that rotates every run. Plain email/password login
# is bearer-token-only (no cookies, no origin check) and works fine.
set -euo pipefail
# Monitor mode: gives each backgrounded job its OWN process group (PGID ==
# the leader's PID) instead of inheriting this script's group. Required for
# teardown to actually work — apps/api's `tsx --watch` runs as a
# supervisor+child pair (confirmed: killing only the child, the one actually
# bound to the port, left the supervisor alive to immediately respawn a new
# child — Node's built-in --watch treats any exit as "restart me"). Killing
# the whole process group at once is the only way to stop both together.
set -m

ACTION="${1:-}"
if [ "$ACTION" != "up" ] && [ "$ACTION" != "down" ]; then
  echo "Usage: sandbox.sh up|down"
  exit 1
fi

WORKTREE_ROOT="$(git rev-parse --show-toplevel)"
HASH="$(printf '%s' "$WORKTREE_ROOT" | shasum | cut -c1-8)"
STATE_DIR="/tmp/neocrm-sandbox-$HASH"

# Five sequential ports, all offset from one hash-derived base — spaced far
# enough from common dev ports (3000, 5173/5174, 8080) that they won't
# collide with a plain `pnpm dev` run in the main tree either.
BASE=$(( (0x$HASH % 3000) * 10 + 20000 ))
API_PORT=$((BASE + 1))
PWA_PORT=$((BASE + 2))
WEB_PORT=$((BASE + 3))
PWA_METRICS_PORT=$((BASE + 4))
WEB_METRICS_PORT=$((BASE + 5))

mkdir -p "$STATE_DIR"

# ─── helpers ─────────────────────────────────────────────────────────────

# is_alive <pidfile> <command-substring>: the pidfile stores a PGID (the
# job's process-group id, set -m guarantees $! is one), not necessarily the
# PID of the process that actually matches <command-substring> — a wrapper
# (pnpm) or supervisor (tsx --watch) can be the group leader while the real
# vite/tsx process is a same-group child with its own distinct PID. So check
# every process currently in that group for a match, not just the leader —
# and require at least one live member, not a bare `kill -0` on a PID that
# could have been recycled by an unrelated process after a reboot (/tmp
# isn't reliably cleared on macOS).
is_alive() {
  local pidfile="$1" expect="$2"
  [ -f "$pidfile" ] || return 1
  local pgid; pgid="$(cat "$pidfile")"
  [ -n "$pgid" ] || return 1
  ps -eo pgid,command= 2>/dev/null | awk -v g="$pgid" '$1==g' | grep -q "$expect"
}

wait_for_port() {
  local port="$1" name="$2" tries=60
  while ! (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null; do
    tries=$((tries - 1))
    if [ "$tries" -le 0 ]; then
      echo "ERROR: $name never came up on port $port — see $STATE_DIR/$name.log"
      exit 1
    fi
    sleep 0.5
  done
  exec 3>&- 2>/dev/null || true
}

# quicktunnel_url <metrics-port> <log-file>: primary lookup is cloudflared's
# own /quicktunnel metrics endpoint (a single JSON field, immune to the
# human-readable banner's wording/format changing across releases) —
# undocumented but stable in practice (verified against metrics/metrics.go,
# cloudflared 2026.9.x). Falls back to grepping the log's stderr banner if
# the metrics endpoint doesn't answer in time, so a future cloudflared
# release that drops the endpoint degrades instead of hanging silently.
quicktunnel_url() {
  local metrics_port="$1" log_file="$2" tries=40 body
  while [ "$tries" -gt 0 ]; do
    body="$(curl -s "http://127.0.0.1:$metrics_port/quicktunnel" || true)"
    if [ -n "$body" ]; then
      local hostname
      hostname="$(printf '%s' "$body" | grep -o '"hostname":"[^"]*"' | cut -d'"' -f4 || true)"
      if [ -n "$hostname" ]; then
        echo "https://$hostname"
        return 0
      fi
    fi
    tries=$((tries - 1))
    sleep 0.5
  done
  # Fallback: scrape the log's own banner line. Guarded with `|| true` because
  # this function's result is assigned via plain `X="$(quicktunnel_url ...)"`
  # (not inside an if/while) — under `set -e`, an unguarded grep/pipefail
  # failure here (no match, e.g. the tunnel truly never came up) would abort
  # the whole script instead of letting the caller's own empty-check report
  # a clean error.
  # Confirmed the hard way: a plain `[a-z0-9-]*` glob also matches
  # api.trycloudflare.com — Cloudflare's OWN control-plane host, which shows
  # up in this same log when tunnel creation fails/times out ("Post
  # \"https://api.trycloudflare.com/tunnel\": ..."), producing a fake
  # "success" URL instead of the failure this should report. A real assigned
  # quick-tunnel hostname is always several hyphen-joined random words —
  # require at least one hyphen so "api" (no hyphen) can never match.
  grep -oE 'https://[a-z0-9]+-[a-z0-9-]+\.trycloudflare\.com' "$log_file" 2>/dev/null | head -1 || true
}

# ─── down ────────────────────────────────────────────────────────────────

stop_one() {
  local pidfile="$1"
  [ -f "$pidfile" ] || return 0
  local pgid; pgid="$(cat "$pidfile")"
  if [ -n "$pgid" ]; then
    # Kill the whole process GROUP, not just the recorded PID — confirmed the
    # recorded leader (pnpm's own wrapper) can exit on its own well before
    # its child (tsx --watch's supervisor, which itself supervises a further
    # child) does, so gating on "is that exact PID still alive" skipped the
    # kill entirely while real, group-sibling processes kept running. A PGID
    # stays valid as long as ANY member of the group is alive, regardless of
    # whether the original leader specifically still is.
    kill -TERM -- "-$pgid" 2>/dev/null || true
    sleep 0.3
    if ps -eo pgid= 2>/dev/null | tr -d ' ' | grep -qx "$pgid"; then
      sleep 1
      kill -KILL -- "-$pgid" 2>/dev/null || true
    fi
  fi
  # A PID file naming an already-dead process/group is the normal case
  # (crashed dev server, prior clean shutdown) — clean it up silently either way.
  rm -f "$pidfile"
}

if [ "$ACTION" = "down" ]; then
  if [ ! -d "$STATE_DIR" ]; then
    echo "No sandbox running for this worktree."
    exit 0
  fi
  for name in api pwa web tunnel-pwa tunnel-web; do
    stop_one "$STATE_DIR/$name.pid"
  done
  rm -rf "$STATE_DIR"
  echo "Sandbox stopped."
  exit 0
fi

# start_or_reuse <pidfile> <log-name> <match-substring> <port> <cmd...>:
# per-service idempotency, not all-or-nothing — if THIS service is already
# alive and matches, leave it running and reuse its port; otherwise confirm
# the port is genuinely free (not squatted by something unrelated) and start
# it. This matters because a single dead piece (e.g. a crashed dev server)
# must not force a restart of siblings that are still running fine, and must
# not be misreported as "port in use by something else" when that something
# else is simply the sibling process itself, on its own distinct port.
start_or_reuse() {
  local pidfile="$1" log_name="$2" match="$3" port="$4"; shift 4
  if is_alive "$pidfile" "$match"; then
    echo "Reusing existing $log_name on port $port"
    return 0
  fi
  local holder
  holder="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | head -1 || true)"
  if [ -n "$holder" ]; then
    echo "ERROR: port $port is already in use by PID $holder ($(ps -p "$holder" -o command= 2>/dev/null)) — not one of this worktree's own sandbox processes."
    exit 1
  fi
  "$@" > "$STATE_DIR/$log_name.log" 2>&1 &
  echo $! > "$pidfile"
  wait_for_port "$port" "$log_name"
}

start_or_reuse_tunnel() {
  local pidfile="$1" log_name="$2" port="$3" metrics_port="$4"
  if is_alive "$pidfile" "cloudflared"; then
    return 0
  fi
  cloudflared tunnel --url "http://localhost:$port" --metrics "127.0.0.1:$metrics_port" \
    > "$STATE_DIR/$log_name.log" 2>&1 &
  echo $! > "$pidfile"
}

cd "$WORKTREE_ROOT"

if ! command -v cloudflared > /dev/null 2>&1; then
  echo "ERROR: cloudflared not found. Install it first: brew install cloudflared"
  exit 1
fi

# apps/api imports @neo/email and @neo/documents by their compiled dist/
# output, not source — a fresh worktree's `pnpm install` alone leaves those
# missing and the API dev server crash-loops on ERR_MODULE_NOT_FOUND. Build
# them first; both are fast (tsc, no bundler). Cheap enough to always redo,
# even on a reuse-heavy rerun, so a source change since the last `up` is
# always reflected.
echo "Building @neo/email and @neo/documents..."
pnpm --filter @neo/email build
pnpm --filter @neo/documents build

echo "Starting sandbox for $WORKTREE_ROOT ..."

start_or_reuse "$STATE_DIR/api.pid" api tsx "$API_PORT" \
  env PORT="$API_PORT" pnpm --filter @neo/api dev

# --host 127.0.0.1 is required, not cosmetic: with no --host, Vite binds
# "localhost" as reported by the OS resolver — on this machine that's ::1,
# not 127.0.0.1 — so both our own IPv4 readiness check and cloudflared's
# `--url http://localhost:$PORT` target need the bind to be explicit and
# IPv4, not left to resolver order.
#
# VITE_SANDBOX_MODE=1 relaxes vite.config.ts's server.allowedHosts to permit
# *.trycloudflare.com (confirmed: Vite's DNS-rebinding protection otherwise
# returns 403 "This host is not allowed" for any request arriving with the
# tunnel's Host header) — scoped to sandbox-launched instances only, a plain
# `pnpm dev` keeps the default (no external host allowed).
start_or_reuse "$STATE_DIR/pwa.pid" pwa vite "$PWA_PORT" \
  env VITE_DEV_API_TARGET="http://localhost:$API_PORT" VITE_SANDBOX_MODE=1 \
  pnpm --filter @neo/pwa exec vite --port "$PWA_PORT" --host 127.0.0.1 --strictPort

start_or_reuse "$STATE_DIR/web.pid" web vite "$WEB_PORT" \
  env VITE_API_URL="http://localhost:$API_PORT" VITE_SANDBOX_MODE=1 \
  pnpm --filter @neo/web exec vite --port "$WEB_PORT" --host 127.0.0.1 --strictPort

start_or_reuse_tunnel "$STATE_DIR/tunnel-pwa.pid" tunnel-pwa "$PWA_PORT" "$PWA_METRICS_PORT"
start_or_reuse_tunnel "$STATE_DIR/tunnel-web.pid" tunnel-web "$WEB_PORT" "$WEB_METRICS_PORT"

PWA_URL="$(quicktunnel_url "$PWA_METRICS_PORT" "$STATE_DIR/tunnel-pwa.log")"
WEB_URL="$(quicktunnel_url "$WEB_METRICS_PORT" "$STATE_DIR/tunnel-web.log")"

if [ -z "$PWA_URL" ] || [ -z "$WEB_URL" ]; then
  echo "ERROR: tunnel didn't come up in time — see $STATE_DIR/tunnel-pwa.log / tunnel-web.log"
  exit 1
fi

echo ""
echo "Sandbox ready:"
echo "  pwa: $PWA_URL"
echo "  web: $WEB_URL"
echo ""
echo "Note: Google login doesn't work through the tunnel (rotating URL can't match the pre-registered OAuth redirect) — use email/password."
echo "Run 'pnpm sandbox:down' when done reviewing."
