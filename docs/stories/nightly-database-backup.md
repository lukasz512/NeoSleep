## Refined User Story: Nightly encrypted backup of the Supabase database and Storage files

**Classification**: feature (data-protection infrastructure for medical data; new scheduled workflow, new external storage, new secrets)
**Linear**: NEO-62 (related: NEO-45)

**Raw input**: "pg dump - chcialbym zeby ta funkcja dzialala codziennie, raz w nocy robi zrzut bazy. chcialbym pewnie na to osobny workflow, tak jak na health... to sa dane medyczne, nie mozemy zgubic tych danych. bezpieczenstwo i kopie danych sa tutaj kluczowe."

Decisions already made by Łukasz (2026-09-25):
- Supabase stays on the **Free plan** for now (no restorable backups there), so we build our own.
- Runs as a **GitHub Actions scheduled workflow**, not a Claude routine: the task is mechanical, and keeping medical data off extra systems matters more than LLM flexibility.
- Destination: a Google Cloud Storage bucket in the neosleep GCP project.
- Retention: **30 days**.
- Order: backup first, API move to Google Cloud Run (NEO-45) second.

### As the platform operator (Łukasz), I want the whole database and every uploaded file copied, encrypted and stored off-Supabase every night so that no medical record or attachment can be permanently lost, whatever happens to Supabase, a migration, or an account.

### Stakeholder Notes
- 👤 User: Invisible day to day. Protects every rep/doctor from losing entered data (PCFs, patients, sleep studies) to an incident.
- 🏢 Client: Tenants (and their DPOs) will ask "what is your backup and restore policy?" during procurement. A tested, documented nightly backup with a retention period is the answer they expect.
- 🩺 Patient: Direct. Lost sleep-study results or treatment plans could delay or corrupt care. Backups protect clinical continuity.
- 🚀 NeoCRM/Platform: Covers every tenant schema automatically (full-database dump), so new tenants are included without config. Same pattern is reused for the future EU stack.
- ⚖️ Compliance: GDPR Art. 32(1)(c) and LFPDPPP both expect the ability to restore availability and access to personal data after an incident. Backups are themselves health data: they must be encrypted, access-restricted and retention-limited. The bucket sits in Mexico (`northamerica-south1`), matching the MX data subjects. Flag for `/legal` once PL patient data lands in this DB (EU transfer question).

### Medical-Industry Trend Check
n/a — internal infrastructure change.

### Acceptance Criteria
- [ ] A scheduled workflow runs every night and can also be started by hand.
- [ ] It produces a full `pg_dump` (custom format) of the Supabase database, covering every schema (all tenants, `platform`, `public`).
- [ ] It copies every object from every Supabase Storage bucket.
- [ ] Before upload, the fresh dump is restored into a throwaway Postgres on the runner, and the job fails if the restore errors or any app schema ends up with zero tables.
- [ ] Both archives are encrypted on the runner with `age` to a public key. The private (decryption) key is **not** stored in GitHub or GCP. Łukasz keeps it offline.
- [ ] Encrypted archives are uploaded to GCS using keyless auth (Workload Identity Federation, no JSON key). The service account may only create objects, not read, overwrite or delete them.
- [ ] The bucket has a 30-day retention policy (objects cannot be deleted early, even by us) and a lifecycle rule that deletes them after 31 days.
- [ ] No unencrypted dump is ever uploaded as a workflow artifact or leaves the runner.
- [ ] A failed run notifies Łukasz (GitHub's scheduled-workflow failure email).
- [ ] A runbook explains, step by step, how to download, decrypt and restore a backup, including a periodic manual restore drill.

### Open Questions
- [ ] Should the retention policy be **locked** (irreversible, nobody can shorten it) after the first week of successful runs? Recommended, but it is a one-way door.
- [ ] Should a dedicated read-only DB role replace the `postgres` superuser connection string for backups? Recommended, and included as an optional setup step.

### Hand-off
→ `/devops` — workflow, GCP setup, secrets (scope is clear, no schema change).
