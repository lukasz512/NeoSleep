# Runbook — API on Google Cloud Run (NEO-45)

Decision record: [ADR-025](ADR-025-api-hosting-cloud-run.md).
Workflow: [.github/workflows/deploy-api.yml](../.github/workflows/deploy-api.yml).

| | dev | prod |
|---|---|---|
| Service | `neosleep-api-dev` | `neosleep-api-prod` |
| Deployed on | push to `dev` | push to `prod` |
| Non-secret config | `infrastructure/cloud-run/dev.env.yaml` | `infrastructure/cloud-run/prod.env.yaml` |
| Frontend secret | `API_URL_DEV` | `API_URL_PROD` (+ website `VITE_API_URL`) |

GCP project `neosleep-api`, region `us-west2`. Console:
<https://console.cloud.google.com/run?project=neosleep-api>

## Deploy

Automatic: merging to `dev` / `prod` when API-related paths change (see the workflow's
`paths`). Manual: Actions → **Deploy API (Cloud Run)** → Run workflow on `dev` or `prod`.
The job fails if `/health` does not return 200 after the deploy.

## Rollback

- **Bad code**: Cloud Run keeps old revisions. Console → service → **Revisions** → pick
  the previous one → **Manage traffic** → 100%. Or:
  `gcloud run services update-traffic neosleep-api-prod --region us-west2 --to-revisions <REVISION>=100`
- **Back to Render entirely** (transition period only): set `API_URL_PROD` / `API_URL_DEV`
  to the onrender.com URL (or delete them; the workflow falls back to
  `RENDER_API_URL_*`), then re-run **Deploy PWA** (and **Deploy Website** for prod).

## Logs

Console → service → **Logs**, or
`gcloud run services logs read neosleep-api-prod --region us-west2 --limit 100`.

## Config and secrets

- **Non-secret** values: edit `infrastructure/cloud-run/<env>.env.yaml`, merge, and it deploys.
- **Secrets** (names in `infrastructure/cloud-run/secrets.list`) live in Secret Manager
  and are shared by dev and prod. To change one:
  `printf '%s' 'NEW_VALUE' | gcloud secrets versions add NAME --project neosleep-api --data-file=-`
  then re-run the deploy (the service reads `:latest` at startup).
- **Adding a secret**: create it in Secret Manager, then add its name to `secrets.list`
  in the same PR. A name in the list without a secret makes the deploy fail.

## Limits to keep in mind

- `max-instances=1` is deliberate: the OrthoApnea queue and rate limiters are in-memory.
- Both services share one Supabase DB, so migrations must be additive only.
- The first request after idle waits for a cold start (a few seconds).

## One-time setup (done once, kept for reference / a future EU stack)

1. `brew install --cask google-cloud-sdk && gcloud auth login` (neosleep Google account).
2. `PROJECT_ID=neosleep-api BILLING_ACCOUNT=<id> bash infrastructure/cloud-run/setup-gcp.sh`
   creates the project, the registry, the service accounts and WIF, and prints 4 values.
3. Set these 4 values as GitHub secrets: `GCP_API_PROJECT`, `GCP_API_WIF_PROVIDER`,
   `GCP_API_DEPLOY_SA`, `GCP_API_RUNTIME_SA`.
4. `RENDER_API_KEY=<key> bash infrastructure/cloud-run/sync-secrets-from-render.sh`
   copies secrets from Render into Secret Manager without printing them.
5. Only when Google login is switched on for deployed environments (it was never
   configured on Render, so it is off at cutover): add `GOOGLE_CLIENT_ID` to the env
   yaml, create the `GOOGLE_CLIENT_SECRET` secret, list it in `secrets.list`, set
   `OAUTH_REDIRECT_ORIGIN` to the service URL, and add
   `https://neosleep-api-{dev,prod}-692668694184.us-west2.run.app/api/v1/auth/google/callback`
   as authorized redirect URIs in the OAuth client (GCP project `neosleep`).
6. Merge to `dev`, check the dev service, set `API_URL_DEV`, re-run Deploy PWA. Then
   repeat for prod.
