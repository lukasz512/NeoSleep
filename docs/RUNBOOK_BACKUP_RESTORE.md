# Runbook — Nightly backup & restore (NEO-62)

Workflow: [.github/workflows/nightly-backup.yml](../.github/workflows/nightly-backup.yml)
Story: [docs/stories/nightly-database-backup.md](stories/nightly-database-backup.md)

## What runs every night

At 09:00 UTC (03:00 Mexico City) GitHub Actions:

1. `pg_dump`s the whole Supabase database (custom format).
2. Restores that dump into a throwaway Postgres 17 and compares the table count of every
   application schema with the dump ([restore-check.sh](../infrastructure/scripts/nightly-backup/restore-check.sh)).
   Any mismatch or restore error fails the run **before** anything is uploaded.
   The check creates every extension the dump lists (CORE-71), and a failed night opens a
   GitHub issue "Nightly backup failed" assigned to the repo owner, or adds a comment to it
   if one is already open. Regression test (Docker):
   `bash infrastructure/scripts/nightly-backup/restore-check.test.sh`.
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
PROJECT_ID="neosleep-backups"
REGION="northamerica-south1"
BUCKET="${PROJECT_ID}-db"
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
connection string, restricted to the application schemas. Learned in the 2026-11-10 drill:

- Restore only `platform`, the tenant schemas and `public`
  (`-n platform -n neosleep -n fourseasons -n test -n public`). Supabase-internal schemas
  (`auth`, `storage`, ...) already exist there and only produce noise.
- `pg_restore -n` does **not** create the schema: `CREATE SCHEMA <name>` for each one first.
- Create the extensions our tables use first:
  `CREATE EXTENSION IF NOT EXISTS btree_gist SCHEMA extensions;` and the same for `ltree`.
- To run the API locally against it: `pnpm install`, then build `@neo/device-order`,
  `@neo/documents` and `@neo/email` before `pnpm --filter @neo/api dev`.

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
decrypt and use it. Refreshing the dev copy (below) counts as a drill.

| Date | Backup | Target | Duration (RTO) | Result |
|---|---|---|---|---|
| 2026-11-10 | 2026-11-09T1943Z | new Supabase project `xlblsuntdaoqhkayufrn` (CORE-189) | 16 min, incl. two avoidable hiccups | 0 restore errors, row counts identical, 60/60 Storage files. Login, patient list, patient record + 5 tabs, 3/3 PDFs worked on the local API. Fixes now in the Restore section. |

## Dev database: anonymized copy of production (CORE-189)

pwa-dev must never read or write production. Its database is a separate Supabase project
(`xlblsuntdaoqhkayufrn`, account neosleepcare@gmail.com, us-east-1), filled from a
nightly backup with all personal data replaced. Scripts: [infrastructure/scripts/dev-db/](../infrastructure/scripts/dev-db/).

What the copy keeps and replaces ([anonymize.sql](../infrastructure/scripts/dev-db/anonymize.sql)):

| | |
|---|---|
| **Kept as is** | Accounts whose email is `@neosleepcare.com` (staff, QA, test doctors), so pwa-dev logins keep working. Clinical answers, exam results and study numbers: without a name they identify no one. Patient city and country. |
| **Replaced** | Every other identity: name, email (`anon-…@anon.invalid`, which can never be delivered), phone (`+52000…`, which can never ring), birth date (1 January of the same year). Clinic name, address, contact details and tax IDs. Medical record numbers, shipping addresses, practitioner licence numbers (cédula, PWZ). File names. |
| **Blanked or deleted** | Free-text notes, notification texts, audit-log snapshots and IPs, partner order payloads, error logs. All login tokens, sessions, passkeys and push subscriptions. |
| **Storage** | Every file becomes a placeholder of the same type (a one-page "Anonymized document" PDF, or a 1×1 image). |

The replacement is deterministic: a re-run gives every person the same fake name.
[pii-check.sql](../infrastructure/scripts/dev-db/pii-check.sql) is the test query: it fails,
naming each rule and row count, if any real name, email, phone, birth date, address, ID,
note, snapshot or token is left. Both run against the real migrated schema in
`pnpm dev-db:test` (needs Docker and `pnpm test-db up --migrate`).

### Refresh the dev copy

Personal data is replaced in a local throwaway Postgres and a local temp folder.
Real data never reaches the dev project.

```bash
# 1. Download and decrypt the latest backup (see Restore above)
age --decrypt -i neosleep-backup-key.txt -o db.dump neosleep-db-<stamp>.dump.age
age --decrypt -i neosleep-backup-key.txt -o storage.tar.gz neosleep-storage-<stamp>.tar.gz.age

# 2. Refresh. Reads the dev credentials from .claude/local/supabase-dev.env
#    (DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_KEY of the DEV project).
pnpm dev-db:refresh "$PWD/db.dump" "$PWD/storage.tar.gz"   # pass - instead of storage to skip files

# 3. Delete the decrypted files
rm db.dump storage.tar.gz
```

The script refuses any `DATABASE_URL` or `SUPABASE_URL` that is not the dev project.
It replaces every application schema on dev, so anything written on pwa-dev since the
last refresh is gone. It prints its duration: write it in the drill table above.

If real data ever lands in the dev project (as it did after the 2026-11-10 drill),
clean it in place:

```bash
pnpm dev-db:refresh --in-place   # anonymize.sql + pii-check.sql on dev, every Storage file replaced
```
