#!/usr/bin/env bash
# Copies the API's secrets from the live Render service into Google Secret Manager
# (NEO-45). Values go straight from Render's API into `gcloud secrets` over a pipe:
# they are never printed, written to disk, or committed.
#
# Only names listed in secrets.list are copied. Anything else Render holds is
# non-secret config and belongs in dev.env.yaml / prod.env.yaml.
#
# Prereq: gcloud logged in (see setup-gcp.sh), jq, and a Render API key
#   (dashboard.render.com → Account Settings → API Keys).
# Usage: RENDER_API_KEY=... PROJECT_ID=neosleep-api bash sync-secrets-from-render.sh
set -euo pipefail

: "${RENDER_API_KEY:?set RENDER_API_KEY}"
PROJECT_ID="${PROJECT_ID:-neosleep-api}"
RENDER_SERVICE="${RENDER_SERVICE:-neosleep-bff}"
REGION="us-west2"
HERE="$(cd "$(dirname "$0")" && pwd)"

render() { curl -sf -H "Authorization: Bearer $RENDER_API_KEY" -H "Accept: application/json" "https://api.render.com/v1$1"; }

SERVICE_ID="$(render "/services?name=${RENDER_SERVICE}&limit=1" | jq -r '.[0].service.id')"
[ -n "$SERVICE_ID" ] && [ "$SERVICE_ID" != "null" ] || { echo "Render service $RENDER_SERVICE not found"; exit 1; }
ENV_JSON="$(render "/services/${SERVICE_ID}/env-vars?limit=100")"

missing=()
while IFS= read -r name; do
  [[ -z "$name" || "$name" == \#* ]] && continue
  if ! jq -e --arg k "$name" 'any(.[]; .envVar.key == $k and (.envVar.value | length) > 0)' <<<"$ENV_JSON" >/dev/null; then
    missing+=("$name")
    continue
  fi
  if ! gcloud secrets describe "$name" --project "$PROJECT_ID" >/dev/null 2>&1; then
    gcloud secrets create "$name" --project "$PROJECT_ID" \
      --replication-policy=user-managed --locations="$REGION" >/dev/null
  fi
  jq -j --arg k "$name" '.[] | select(.envVar.key == $k) | .envVar.value' <<<"$ENV_JSON" \
    | gcloud secrets versions add "$name" --project "$PROJECT_ID" --data-file=- >/dev/null
  echo "✓ $name"
done < "$HERE/secrets.list"

if [ "${#missing[@]}" -gt 0 ]; then
  echo
  echo "Not set on Render (remove from secrets.list, or the deploy will fail): ${missing[*]}"
fi
