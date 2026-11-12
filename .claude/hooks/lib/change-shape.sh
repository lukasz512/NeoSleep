#!/usr/bin/env bash
# Which kind of handover a branch needs (CORE-175, decision slim-r1 D2). Source it, then
# `change_shape <newline-separated paths>` → "full" or "light".
#   full  = UI or feature: any .vue/.css/.scss, a view, an API route or a migration.
#           Needs the full ship-artifact page (before/after, 3 sections, Change Index row).
#   light = everything else (service fix, hooks, docs, config). One board comment with
#           the PR link is the handover: `build.mjs light`.

FULL_SHAPE_REGEX='\.(vue|css|scss)$|^apps/[^/]+/src/(views|routes)/|^apps/api/migrations/'

change_shape() {
  if printf '%s\n' "$1" | grep -qE "$FULL_SHAPE_REGEX"; then echo full; else echo light; fi
}
