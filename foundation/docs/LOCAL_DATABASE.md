# Local database first, then host

Use **PostgreSQL locally** during development; same schema and BFF code later against a hosted Postgres (Neon, Supabase, etc.). Reduces risk and lets you learn the stack before paying or configuring cloud.

## MVP path (e.g. 2–3 months to MVP)

- **Now:** Use the **developer database in the project** (Docker Postgres). Run `docker compose up -d`, set `DATABASE_URL` in BFF `.env`, add migrations and first tables. All work happens against local DB; no server or billing.
- **Later (UAT / before launch):** Add a **hosted** Postgres (Neon or Supabase free tier), set `DATABASE_URL` there, run the same migrations. BFF code stays the same; only the connection string changes.
- **Summary:** Start with local; add a server DB only when you need a shared environment (testers, staging, or production). You don’t need to “podłączyć na serwerze” from day one.

## Why local first

- No dependency on external DB during early development.
- Same SQL and migrations work when you switch to Neon/Supabase/Railway.
- You can work offline; no billing or account setup until you need UAT/prod.
- When ready, set `DATABASE_URL` to the hosted instance and deploy BFF.

## How to run Postgres locally

### Option 1: Docker (recommended)

Create `docker-compose.yml` in repo root (or in `services/bff`):

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: neosleep
      POSTGRES_PASSWORD: neosleep_local
      POSTGRES_DB: neosleep
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

Run: `docker compose up -d`. Connect with `postgresql://neosleep:neosleep_local@localhost:5432/neosleep`.

### Viewing data (browser / GUI)

**From the terminal** (no extra install):

```bash
# List tables
docker compose exec postgres psql -U neosleep -d neosleep -c "\dt"

# Query leads
docker compose exec postgres psql -U neosleep -d neosleep -c "SELECT * FROM tbl_leads;"

# Interactive SQL shell
docker compose exec postgres psql -U neosleep -d neosleep
# Then: \dt (tables), \d tbl_leads (table structure), SELECT * FROM tbl_leads;, \q (quit)
```

**In the browser (Docker):** the repo `docker-compose.yml` includes **Adminer**. After `docker compose up -d`, open http://localhost:8080 and log in:

| Field    | Value        |
|----------|--------------|
| System   | PostgreSQL   |
| Server   | postgres     |
| Username | neosleep     |
| Password | neosleep_local |
| Database | neosleep     |

You can browse tables and run SQL there. No install on your machine.

**Desktop GUI** (DBeaver, pgAdmin, TablePlus, or VS Code PostgreSQL extension): connect with:

| Host     | Port | Database | User    | Password        |
|----------|------|----------|---------|-----------------|
| localhost | 5432 | neosleep | neosleep | neosleep_local  |

### Option 2: Native Postgres

Install Postgres 15+ on your machine, create database and user, then set:

`DATABASE_URL=postgresql://user:password@localhost:5432/neosleep`

## BFF configuration

- BFF reads `DATABASE_URL` from env. If unset, BFF can start without DB (e.g. only `/health`) until you add the first DB-backed route.
- Local: `.env` or `.env.local` with `DATABASE_URL=...`
- UAT/Prod: set `DATABASE_URL` in the host (Vercel/Railway/Render env).

## Creating tables (migration script)

Schema is defined in **SQL files** in `services/bff/migrations/`. To create all tables (e.g. on a fresh DB):

**From repo root** (with Postgres running: `docker compose up -d`):

```bash
docker compose exec -T postgres psql -U neosleep -d neosleep < services/bff/migrations/001_initial.sql
```

This creates the `tbl_leads` table and inserts 3 sample rows if the table is empty. Full details (hosted DB, reset, verification): **foundation/docs/DATABASE_MIGRATIONS.md**.

## When to move to hosted

- When you need **UAT** or **production** with a persistent, shared DB.
- Pick Neon or Supabase; set `DATABASE_URL`; run the same migrations. No code change in BFF beyond the connection string.

## Summary

- **Local**: Docker or native Postgres; `DATABASE_URL` in `.env`.
- **Later**: Hosted Postgres (Neon/Supabase); set `DATABASE_URL` in deployment. Same schema, same BFF.
