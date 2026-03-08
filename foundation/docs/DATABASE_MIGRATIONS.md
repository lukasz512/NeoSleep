# Database migrations – creating and updating tables

This doc describes how to create and update the NeoSleep database schema. The **single source of truth** for the schema is the SQL migration files in `services/bff/migrations/`.

## When to run migrations

- **New database** (e.g. first time with Docker, or a new hosted Postgres for UAT/prod): run the migration script to create all tables.
- **New table or column** (after adding a new migration file): run the new migration(s).
- **Reset local DB** (optional): remove the volume, start Postgres again, then run migrations. See “Reset local database” below.

## Migration files

| File | Description |
|------|-------------|
| `services/bff/migrations/001_initial.sql` | Creates `tbl_leads` table and inserts optional seed rows (3 sample leads). |
| `services/bff/migrations/003_console_logs_and_fix_tasks.sql` | Creates `tbl_console_errors` (prod errors) and `tbl_fix_tasks` (recurrence-based fix tasks). See CONSOLE_LOGS_AND_SELF_HEALING.md. |
| `services/bff/migrations/004_users.sql` | Creates `tbl_users` (email, name, role: admin \| manager \| rep, provider, provider_id, region). |
| `services/bff/migrations/005_rename_console_logs_to_console_errors.sql` | Renames existing `tbl_console_logs` to `tbl_console_errors` (for DBs created before the rename). |
| `services/bff/migrations/006_hco_hcp.sql` | Creates `tbl_hco` (organizations) and `tbl_hcp` (healthcare professionals), linked to each other and to leads. See LEADS_AND_PARTNERS.md. |
| `services/bff/migrations/007_leads_institution.sql` | Adds `institution` column to `tbl_leads`. |
| `services/bff/migrations/008_hco_hcp_seed.sql` | Seed data for HCO/HCP. |
| `services/bff/migrations/009_dev_seed_2hco_4hcp.sql` | Dev seed for HCO/HCP. |
| `services/bff/migrations/010_presentations.sql` | Creates `tbl_presentations` for PDF/PPTX files. |
| `services/bff/migrations/011_events.sql` | Creates `tbl_events`, `tbl_event_attendees`, `tbl_communication_log` for Planner. See SPEC-0043. |
| `services/bff/migrations/012_audit_log.sql` | Creates `tbl_audit_log` for reporting who created leads/contacts. |
| `services/bff/migrations/015_app_config.sql` | Creates `tbl_app_config` (primary_color, secondary_color, border_radius, logo_url) for shared theme/branding. See BRAND_AND_APP_CONFIG.md. |
| `services/bff/migrations/016_app_config_theme.sql` | Adds surface_color, hero_container_style, color_scheme to tbl_app_config for Genesis-style theme panel in rep-app. |
| `services/bff/migrations/017_app_config_dark_colors.sql` | Adds primary_color_dark and secondary_color_dark to tbl_app_config for dark-mode theme colors. |

New migrations will be added as `013_*.sql`, etc. Keep the order: run 001, then 003, 004, 005, 006, 007, 008, 009, 010, 011, 012, 015, 016, 017, etc.

## How to run migrations

### Option A: From repo root (recommended)

Postgres must be running (`docker compose up -d`). Then:

```bash
docker compose exec -T postgres psql -U neosleep -d neosleep < services/bff/migrations/001_initial.sql
docker compose exec -T postgres psql -U neosleep -d neosleep < services/bff/migrations/003_console_logs_and_fix_tasks.sql
docker compose exec -T postgres psql -U neosleep -d neosleep < services/bff/migrations/004_users.sql
docker compose exec -T postgres psql -U neosleep -d neosleep < services/bff/migrations/005_rename_console_logs_to_console_errors.sql
docker compose exec -T postgres psql -U neosleep -d neosleep < services/bff/migrations/006_hco_hcp.sql
docker compose exec -T postgres psql -U neosleep -d neosleep < services/bff/migrations/007_leads_institution.sql
docker compose exec -T postgres psql -U neosleep -d neosleep < services/bff/migrations/008_hco_hcp_seed.sql
docker compose exec -T postgres psql -U neosleep -d neosleep < services/bff/migrations/009_dev_seed_2hco_4hcp.sql
docker compose exec -T postgres psql -U neosleep -d neosleep < services/bff/migrations/010_presentations.sql
docker compose exec -T postgres psql -U neosleep -d neosleep < services/bff/migrations/011_events.sql
docker compose exec -T postgres psql -U neosleep -d neosleep < services/bff/migrations/012_audit_log.sql
```

- `-T` disables a TTY (needed when piping from a file).
- This creates the `tbl_leads` table and, if the table is empty, inserts 3 sample rows.

### Option B: From services/bff

```bash
cd services/bff
cat migrations/001_initial.sql | docker compose -f ../../docker-compose.yml exec -T postgres psql -U neosleep -d neosleep
```

### Option C: Hosted Postgres (Neon, Supabase, etc.)

Use the same SQL file. Either:

- **psql** with the hosted connection string, e.g.  
  `psql "postgresql://user:pass@host:5432/neosleep?sslmode=require" -f services/bff/migrations/001_initial.sql`
- Or paste and run the contents of `001_initial.sql` in the provider’s SQL editor (Neon/Supabase dashboard).

### Option D: BFF on startup

The BFF also runs **initDb()** when it starts (if `DATABASE_URL` is set). That creates the `tbl_leads` table and seeds it if empty. So you can either:

- Run the migration script once (Option A or B), **or**
- Start the BFF once and let it create the table and seed.

For a **new environment** (e.g. staging), prefer running the migration script explicitly so the schema is always applied from the files.

## Verify tables

After running the migration:

```bash
docker compose exec postgres psql -U neosleep -d neosleep -c "\dt"
```

You should see `tbl_leads` (and any other tables from later migrations). To view data:

```bash
docker compose exec postgres psql -U neosleep -d neosleep -c "SELECT * FROM tbl_leads;"
```

Or use Adminer: http://localhost:8080 (see LOCAL_DATABASE.md).

## Reset local database

If you want a clean database (e.g. to re-run migrations from scratch):

1. Stop and remove the volume:
   ```bash
   docker compose down -v
   ```
   (`-v` removes the `postgres_data` volume; all data is deleted.)

2. Start Postgres again:
   ```bash
   docker compose up -d
   ```

3. Run the migration script (Option A above).

## Summary

- **Schema lives in:** `services/bff/migrations/*.sql`.
- **Create tables:** run `001_initial.sql` (and later migrations in order) against your DB.
- **Local:** `docker compose exec -T postgres psql -U neosleep -d neosleep < services/bff/migrations/001_initial.sql`
- **Hosted:** run the same SQL via `psql` or the provider’s SQL editor.
- **Docs:** LOCAL_DATABASE.md (run Postgres, view data), this file (migrations).
