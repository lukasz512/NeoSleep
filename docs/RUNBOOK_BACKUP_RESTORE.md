# Runbook — Nightly backup & restore (NEO-62)

Workflow: [.github/workflows/nightly-backup.yml](../.github/workflows/nightly-backup.yml)
Story: [docs/stories/nightly-database-backup.md](stories/nightly-database-backup.md)

## What runs every night

At 09:00 UTC (03:00 Mexico City) GitHub Actions:

1. `pg_dump`s the whole Supabase database (custom format).
2. Restores that dump into a throwaway Postgres 17 and compares the table count of every
   application schema with the dump ([restore-check.sh](../infrastructure/scripts/nightly-backup/restore-check.sh)).
   Any mismatch or restore error fails the run **before** anything is uploaded.
3. Copies every object from every Supabase Storage bucket ([storage-export.mjs](../infrastructure/scripts/nightly-backup/storage-export.mjs)).
4. Encrypts both archives with [`age`](https://github.com/FiloSottile/age) to a public key.
5. Uploads to `gs://<bucket>/YYYY/MM/DD/`:
   - `neosleep-db-<stamp>.dump.age`
   - `neosleep-storage-<stamp>.tar.gz.age`

The bucket has a 30-day retention policy (objects cannot be deleted or overwritten
before 30 days, by anyone) and a lifecycle rule that deletes them at 31 days.
The GitHub service account can only **create** objects, not read or delete them.

A failed scheduled run emails the person who last edited the workflow's `cron` line.

## Security model

| Secret | Where it lives | Who can use it |
|---|---|---|
| age **private** key (decrypts backups) | Łukasz's password manager + one offline copy. **Never** in GitHub, GCP or the repo. | Łukasz only |
| age public key (`BACKUP_AGE_RECIPIENT`) | GitHub secret. Not sensitive: it can only encrypt. | workflow |
| `BACKUP_DATABASE_URL`, `SUPABASE_SERVICE_KEY` | GitHub secrets | workflow |
| GCP access | none stored: keyless Workload Identity Federation, limited to this repo's `dev` branch | workflow |

**If the age private key is lost, every backup becomes unreadable.** Keep two copies.

## One-time setup

### 1. Generate the encryption key (on your Mac)

```bash
brew install age
age-keygen -o ~/neosleep-backup-key.txt
```

The command prints `Public key: age1...`. Keep that line for step 3.
Save the whole file content in your password manager, make one offline copy
(printed or on a USB stick in a safe place), then delete `~/neosleep-backup-key.txt`.

### 2. GCP bucket + keyless access (Google Cloud Shell)

1. Open <https://console.cloud.google.com/> with the neosleep Google account and pick the
   project (top bar). Billing must be enabled for the project:
   <https://console.cloud.google.com/billing/linkedaccount>.
2. Open Cloud Shell (the `>_` icon, top right). It is a terminal in the browser with
   `gcloud` already logged in.
3. Set `PROJECT_ID` to the project ID shown in the project picker, paste the block, press Enter:

```bash
PROJECT_ID="REPLACE_ME"
REGION="northamerica-south1"
BUCKET="neosleep-backups-${PROJECT_ID}"
REPO="lukasz512/NeoSleep"

gcloud config set project "$PROJECT_ID"
gcloud services enable iamcredentials.googleapis.com sts.googleapis.com storage.googleapis.com

gcloud storage buckets create "gs://$BUCKET" --location="$REGION" \
  --uniform-bucket-level-access --public-access-prevention --retention-period=30d
echo '{"rule":[{"action":{"type":"Delete"},"condition":{"age":31}}]}' > lifecycle.json
gcloud storage buckets update "gs://$BUCKET" --lifecycle-file=lifecycle.json

gcloud iam service-accounts create github-backup --display-name="GitHub nightly backup (NEO-62)"
SA="github-backup@${PROJECT_ID}.iam.gserviceaccount.com"
gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" \
  --member="serviceAccount:$SA" --role=roles/storage.objectCreator

gcloud iam workload-identity-pools create github --location=global --display-name="GitHub Actions"
gcloud iam workload-identity-pools providers create-oidc github-repo \
  --location=global --workload-identity-pool=github \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
  --attribute-condition="assertion.repository=='${REPO}' && assertion.ref=='refs/heads/dev'"

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
gcloud iam service-accounts add-iam-policy-binding "$SA" --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github/attribute.repository/${REPO}"

echo
echo "GCS_BACKUP_BUCKET          = $BUCKET"
echo "GCP_BACKUP_SERVICE_ACCOUNT = $SA"
echo "GCP_WIF_PROVIDER           = projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github/providers/github-repo"
```

The last three lines are the values for step 3.

### 3. GitHub secrets

<https://github.com/lukasz512/NeoSleep/settings/secrets/actions> → **New repository secret**, once per row:

| Name | Value |
|---|---|
| `BACKUP_DATABASE_URL` | Same value as `DATABASE_URL` in Render (Dashboard → neosleep-bff → Environment) |
| `SUPABASE_URL` | Same as in Render |
| `SUPABASE_SERVICE_KEY` | Same as in Render |
| `BACKUP_AGE_RECIPIENT` | The `age1...` public key from step 1 |
| `GCS_BACKUP_BUCKET` | from step 2 output |
| `GCP_BACKUP_SERVICE_ACCOUNT` | from step 2 output |
| `GCP_WIF_PROVIDER` | from step 2 output |

### 4. First run

After the PR is merged to `dev`: <https://github.com/lukasz512/NeoSleep/actions/workflows/nightly-backup.yml>
→ **Run workflow**. It must end green, and two `.age` files must appear in the bucket
(<https://console.cloud.google.com/storage/browser>).

### 5. Optional, after one week of green runs

- Lock the retention policy. It is irreversible: from then on nobody, including us, can
  shorten it or delete the bucket while it holds objects younger than 30 days.
  `gcloud storage buckets update gs://$BUCKET --lock-retention-period`
- Replace `BACKUP_DATABASE_URL` with a dedicated read-only role instead of `postgres`.

## Restore

**Always restore into a new, empty database first, never straight over production.**

```bash
# 1. Download (needs a Google account with read access to the bucket, e.g. project owner)
gcloud storage ls "gs://$BUCKET/2026/09/25/"
gcloud storage cp "gs://$BUCKET/2026/09/25/neosleep-db-<stamp>.dump.age" .

# 2. Decrypt with the offline private key
age --decrypt -i neosleep-backup-key.txt -o db.dump neosleep-db-<stamp>.dump.age

# 3. Inspect, then restore into an empty target
pg_restore --list db.dump | head -50
pg_restore --no-owner --no-privileges --dbname="$TARGET_URL" db.dump
```

Restoring into a fresh Supabase project: create the project, then run step 3 with its
connection string. Supabase-internal schemas (`auth`, `storage`, ...) already exist there
and will report "already exists" errors. Those are expected; application schemas
(`platform`, tenant schemas, `public`) are what matters.

Storage files:

```bash
age --decrypt -i neosleep-backup-key.txt -o storage.tar.gz neosleep-storage-<stamp>.tar.gz.age
tar -xzf storage.tar.gz   # -> storage/<bucket>/<path>
```

Re-upload with the Supabase dashboard or `supabase storage cp`. Paths must match the
`file_attachment` rows.

Delete the decrypted files once done. They are medical data.

## Restore drill (every 3 months)

Download the latest backup, decrypt it, restore into a local Docker Postgres, open a few
known patients and one attachment. Write the date and result in NEO-62 (or its successor).
The nightly restore check proves the dump is valid; the drill proves **we** can still
decrypt and use it.
