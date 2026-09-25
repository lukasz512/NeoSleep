#!/usr/bin/env bash
# One-time Google Cloud setup for the API on Cloud Run (NEO-45, ADR-025).
# Safe to re-run: every step tolerates "already exists".
#
# Prereq: gcloud installed and logged in as the neosleep Google account
#   (brew install --cask google-cloud-sdk && gcloud auth login)
#
# Usage: PROJECT_ID=neosleep-api BILLING_ACCOUNT=XXXXXX-XXXXXX-XXXXXX bash setup-gcp.sh
set -uo pipefail

PROJECT_ID="${PROJECT_ID:-neosleep-api}"
BILLING_ACCOUNT="${BILLING_ACCOUNT:?set BILLING_ACCOUNT (Billing → Account management → Billing account ID)}"
REGION="us-west2"
REPO="lukasz512/NeoSleep"

run() { echo "+ $*"; "$@" || echo "  (continuing: already exists or not needed)"; }

run gcloud projects create "$PROJECT_ID" --name="NeoSleep API"
run gcloud billing projects link "$PROJECT_ID" --billing-account="$BILLING_ACCOUNT"
gcloud config set project "$PROJECT_ID"

run gcloud services enable run.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com \
  iamcredentials.googleapis.com sts.googleapis.com

# Image registry, keeping only the 5 newest images (storage stays inside the free 0.5 GB).
run gcloud artifacts repositories create api --repository-format=docker --location="$REGION" \
  --description="neosleep-api images (NEO-45)"
cat > /tmp/neo-ar-cleanup.json <<'JSON'
[{"name":"keep-5-newest","action":{"type":"Keep"},"mostRecentVersions":{"keepCount":5}},
 {"name":"delete-rest","action":{"type":"Delete"},"condition":{"tagState":"ANY"}}]
JSON
run gcloud artifacts repositories set-cleanup-policies api --location="$REGION" --policy=/tmp/neo-ar-cleanup.json

# Runtime identity of the API: may only read its own secrets.
run gcloud iam service-accounts create api-runtime --display-name="NeoSleep API runtime"
RUNTIME_SA="api-runtime@${PROJECT_ID}.iam.gserviceaccount.com"
run gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$RUNTIME_SA" \
  --role=roles/secretmanager.secretAccessor --condition=None

# Deploy identity used by GitHub Actions: push images, deploy services, act as the runtime SA.
run gcloud iam service-accounts create github-deploy --display-name="GitHub Actions deploy (NEO-45)"
DEPLOY_SA="github-deploy@${PROJECT_ID}.iam.gserviceaccount.com"
for role in roles/run.admin roles/artifactregistry.writer; do
  run gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$DEPLOY_SA" --role="$role" --condition=None
done
run gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" \
  --member="serviceAccount:$DEPLOY_SA" --role=roles/iam.serviceAccountUser

# Keyless login from GitHub Actions — only this repo, only the dev and prod branches.
run gcloud iam workload-identity-pools create github --location=global --display-name="GitHub Actions"
run gcloud iam workload-identity-pools providers create-oidc github-repo \
  --location=global --workload-identity-pool=github \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
  --attribute-condition="assertion.repository=='${REPO}' && (assertion.ref=='refs/heads/dev' || assertion.ref=='refs/heads/prod')"
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
run gcloud iam service-accounts add-iam-policy-binding "$DEPLOY_SA" --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github/attribute.repository/${REPO}"

echo
echo "GCP_API_PROJECT      = $PROJECT_ID"
echo "GCP_API_WIF_PROVIDER = projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github/providers/github-repo"
echo "GCP_API_DEPLOY_SA    = $DEPLOY_SA"
echo "GCP_API_RUNTIME_SA   = $RUNTIME_SA"
echo "Service URLs will be: https://neosleep-api-dev-${PROJECT_NUMBER}.${REGION}.run.app"
echo "                      https://neosleep-api-prod-${PROJECT_NUMBER}.${REGION}.run.app"
