# Directus: dev in Docker, then deploy on Hetzner

**Strategy:** Develop with everything in Docker (Postgres + Directus + optional BFF). When ready, move the same stack to a Hetzner VPS. Directus is your admin panel; you need it available during dev and later at admin.neosleepcare.com.

---

## Reset Docker and full setup (start from zero)

Use this when you want a **clean database** and to see all admin UIs with the correct tables.

**1. Stop and remove everything (including data):**

```bash
docker compose down -v
```

(`-v` removes the `postgres_data` volume – all DB data is deleted.)

**2. Start all services from scratch:**

```bash
docker compose up -d
```

**3. Wait a few seconds for Postgres to be ready, then run all migrations:**

```bash
docker compose exec -T postgres psql -U neosleep -d neosleep < services/bff/migrations/001_initial.sql
docker compose exec -T postgres psql -U neosleep -d neosleep < services/bff/migrations/003_console_logs_and_fix_tasks.sql
docker compose exec -T postgres psql -U neosleep -d neosleep < services/bff/migrations/004_users.sql
docker compose exec -T postgres psql -U neosleep -d neosleep < services/bff/migrations/005_rename_console_logs_to_console_errors.sql
docker compose exec -T postgres psql -U neosleep -d neosleep < services/bff/migrations/006_hco_hcp.sql
```

**4. Restart Directus so it sees the new tables:**

```bash
docker compose restart directus
```

**5. Open all admin UIs:**

| What        | URL                     | Login / use |
|------------|--------------------------|-------------|
| **Adminer** (DB viewer) | http://localhost:8080 | System: **PostgreSQL**, Server: **postgres**, User: **neosleep**, Password: **neosleep_local**, Database: **neosleep**. Then you see tables: `tbl_leads`, `tbl_console_errors`, `tbl_fix_tasks`, `tbl_users`, `tbl_hco`, `tbl_hcp`, `directus_*`. |
| **Directus** (admin panel) | http://localhost:8056 | Email: **admin@neosleep.local**, Password: **admin**. Then **Settings → Data Model** – you should see **tbl_leads**, **tbl_console_errors**, **tbl_fix_tasks**, **tbl_users**, **tbl_hco**, **tbl_hcp** and system collections. **Content** shows your collections. |

**6. Verify tables in terminal (optional):**

```bash
docker compose exec postgres psql -U neosleep -d neosleep -c "\dt"
```

You should see `tbl_leads`, `tbl_console_errors`, `tbl_fix_tasks`, `tbl_users`, `tbl_hco`, `tbl_hcp`, and `directus_*` tables.

After this, the “setup bazy” topic is closed: one reset procedure, one place (this section) for the full flow.

---

## Dev now: full stack in Docker

From repo root:

```bash
docker compose up -d
```

This starts:

| Service   | Port | URL                    | Purpose              |
|-----------|------|------------------------|----------------------|
| postgres  | 5432 | (connection string)    | Database             |
| adminer   | 8080 | http://localhost:8080 | DB viewer            |
| directus  | 8056 | http://localhost:8056 | Admin panel          |

**First time (if you didn’t follow “Reset Docker and full setup” above):**

1. Apply app migrations so app tables exist:
   ```bash
   docker compose exec -T postgres psql -U neosleep -d neosleep < services/bff/migrations/001_initial.sql
   docker compose exec -T postgres psql -U neosleep -d neosleep < services/bff/migrations/003_console_logs_and_fix_tasks.sql
   docker compose exec -T postgres psql -U neosleep -d neosleep < services/bff/migrations/004_users.sql
   docker compose exec -T postgres psql -U neosleep -d neosleep < services/bff/migrations/005_rename_console_logs_to_console_errors.sql
   docker compose exec -T postgres psql -U neosleep -d neosleep < services/bff/migrations/006_hco_hcp.sql
   docker compose restart directus
   ```
2. Open **http://localhost:8056**. Directus will show a setup/login screen. Log in with:
   - **Email:** `admin@neosleep.local`
   - **Password:** `admin` (set in `docker-compose.yml`; change for production)
3. In Directus, go to **Settings → Data Model**. You should see your app table **tbl_leads** plus Directus system tables (`directus_*`). In **Content**, open the **tbl_leads** collection to view or edit rows.

**If you don’t see your tables in Directus:** Directus introspects the database at runtime. Ensure migrations were run **before** the first time you opened Directus (or restart Directus after running them): `docker compose restart directus`. Then check **Settings → Data Model** again. App table name is **tbl_leads**.

**BFF:** Run separately (same machine): `cd services/bff && pnpm dev`. Set `DATABASE_URL=postgresql://neosleep:neosleep_local@localhost:5432/neosleep` in `services/bff/.env` so BFF uses the same Postgres as Directus.

**Rep-app:** Run separately: `cd apps/rep-app && pnpm dev`. It talks to BFF at http://localhost:3000.

---

## Expose Directus (access from the internet)

If you need to use Directus when you’re not at your dev machine (e.g. laptop elsewhere, or share with someone), expose it with a tunnel. No VPS needed for this.

### Option A: Cloudflare Tunnel (free, recommended)

1. Install [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/).
2. Run a quick tunnel to port 8055:
   ```bash
   cloudflared tunnel --url http://localhost:8056
   ```
3. Cloudflare will print a URL like `https://xxx.trycloudflare.com`. Open it in the browser – that’s your Directus, exposed for this session.
4. For a stable URL (e.g. admin.neosleepcare.com), create a named tunnel and a CNAME in your domain; see [Cloudflare Tunnel docs](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/).

### Option B: ngrok

1. Install [ngrok](https://ngrok.com), sign up (free tier is enough).
2. Run: `ngrok http 8056`
3. Use the HTTPS URL ngrok shows (e.g. `https://abc123.ngrok.io`) to open Directus from anywhere.

**Security:** While the tunnel is on, anyone with the URL can try to log in. Use a strong `ADMIN_PASSWORD` and turn off the tunnel when you’re done. For production, use Hetzner + proper DNS and HTTPS instead of a temporary tunnel.

---

## Later: same stack on Hetzner

When you’re ready to deploy:

1. Rent a small VPS on Hetzner (e.g. CX22 or similar).
2. On the VPS: install Docker and Docker Compose. Copy (or clone) your repo and the same `docker-compose.yml` (or a production variant with stronger `KEY`/`SECRET`/`ADMIN_PASSWORD` and `PUBLIC_URL=https://admin.neosleepcare.com`).
3. Run migrations on the VPS Postgres (or attach a managed DB). Run `docker compose up -d` so Postgres + Directus (and optionally BFF) start.
4. Point **admin.neosleepcare.com** to the VPS IP (A record) and put a reverse proxy (e.g. Caddy or Nginx) in front of Directus with HTTPS.
5. Rep, portal, website on GoDaddy keep calling the BFF (on the same VPS or elsewhere); BFF and Directus share the same Postgres.

So: **dev = Docker on your machine; deploy = same Docker setup on Hetzner**, with env and DNS adjusted for production.
