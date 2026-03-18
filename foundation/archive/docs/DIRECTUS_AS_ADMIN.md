# Directus as admin panel – decision and setup

**Decision:** The **admin panel** is **Directus** (self-hosted). The Vue app in `apps/admin` is **deprecated / removed** from the product. Rep app, portal, and website stay as-is.

**Quick start:** For **dev in Docker** (Postgres + Directus), **exposing Directus** (tunnel), and **later deploy on Hetzner**, see [DIRECTUS_DEV_AND_DEPLOY.md](DIRECTUS_DEV_AND_DEPLOY.md).

## Why Directus

- Full admin UI out of the box: content, users, roles, permissions, flows.
- Connects to **our** PostgreSQL – one database, full control, no vendor lock-in for data.
- Open source, self-hosted = **no per-seat or cloud fee**; you pay only for the server (or run it at home).
- Fits “admin = manage data, users, config” without building a custom Vue admin.

## Apps after the decision

| App       | Status | Notes |
|-----------|--------|--------|
| **Rep**   | Kept   | apps/rep-app – unchanged. |
| **Portal**| Kept   | HCP/client portal – unchanged. |
| **Website** | Kept | Marketing site – unchanged. |
| **Admin** | **Replaced by Directus** | No `apps/admin` deploy; admin.neosleepcare.com (or chosen URL) serves Directus. |

## Database: your copy, no licence cost

- **PostgreSQL** is open source. You never pay a “Postgres licence”.
- You can always have **your own copy** of the database:
  - **Locally:** Docker (as now) or native Postgres – free.
  - **Self-hosted:** Postgres on your own server (VPS or home) – you pay only for the machine, not for the DB software.
  - **Managed (optional):** Neon, Supabase, etc. – you pay for hosting, not for the Postgres product itself.
- **Directus** uses the **same** Postgres as the BFF (one instance). Directus adds its own tables (e.g. `directus_*`) for its config; your app tables (e.g. `tbl_leads`) stay in the same DB. So one database, one “copy” – BFF and Directus both connect to it.

## How not to pay for Directus

- **Self-host:** run Directus + Postgres on a machine you control.
  - **VPS** (DigitalOcean, Hetzner, OVH, etc.): small instance is enough to start; you pay only for the server (often a few €/month).
  - **Home server / NAS:** if you have one, you can run Docker there (Directus + Postgres) and pay nothing for software; only power and internet.
- **Directus Cloud** exists but is paid; we do **not** use it if the goal is zero cost for the admin panel.

## Hosting: GoDaddy vs VPS

- **GoDaddy** (classic shared hosting): typically cPanel, PHP, MySQL. It is **not** suited to run Docker, Node, or PostgreSQL. You cannot “auto-host” Directus + Postgres on standard GoDaddy shared hosting.
- **To self-host Directus + Postgres** you need one of:
  - **VPS** (recommended): e.g. DigitalOcean Droplet, Hetzner Cloud, OVH VPS. You install Docker (or Docker Compose) and run Postgres + Directus there. Domain from GoDaddy can point to this VPS (DNS A record).
  - **Home server:** same idea; you open a port or use a tunnel (e.g. Cloudflare Tunnel) and point the domain to it.
- So: **GoDaddy** = fine for **domain/DNS**; **hosting for Directus + Postgres** = VPS (or similar), not GoDaddy shared hosting.

## What to document next (after your answers)

- Exact URL for admin (e.g. admin.neosleepcare.com → Directus).
- Where Postgres + Directus run in production (which VPS, which region).
- How BFF and Directus share the same DB (connection strings, env vars).
- Optional: add Directus + Postgres to repo’s `docker-compose.yml` for local dev so the whole stack (BFF, rep-app, Directus, Postgres) runs with one `docker compose up`.

## Confirmed setup

- **URL for admin:** `admin.neosleepcare.com` → Directus.
- **Rep, portal, website:** Hosted on **GoDaddy** (aplikacje internetowe). They are frontends that **fetch data via BFF** (they do not connect to Postgres directly). In GoDaddy you deploy the built static files (e.g. Vite build output); the app calls `api.neosleepcare.com` (or the BFF URL you set).
- **BFF:** Serves rep and portal (and website if needed). Reads/writes **Postgres**. Must be hosted somewhere (not on classic GoDaddy shared hosting, which is PHP/cPanel).
- **Directus:** Admin panel for you. Connects to the **same Postgres** as BFF. Used only in the browser at admin.neosleepcare.com.
- **Postgres:** One instance. BFF and Directus both use it. Can be managed (Neon, Supabase) or self-hosted (VPS).

So you need to host **three things** somewhere (not on GoDaddy shared hosting): **Postgres**, **BFF**, **Directus**. GoDaddy is only for serving the frontend apps (rep, portal, website) and for domain/DNS.

---

## Hosting options: free vs very cheap

Goal: host **Postgres + BFF + Directus** so that admin.neosleepcare.com works and rep/portal/website (on GoDaddy) can call the BFF. Below: options from “maximum free” to “very cheap”.

### Option A: Maximum free (no monthly fee)

| Component   | Where              | Cost   | Notes |
|------------|--------------------|--------|--------|
| **Postgres** | **Neon** (neon.tech) | **$0** | Free tier: 0.5 GB storage, 100 CU-hours/month, scale-to-zero. One connection string for BFF and Directus. No credit card for signup. |
| **BFF**      | **Vercel** (serverless) or **Railway** ($1/month credit) | **$0** (Vercel free tier) or ~$0 if within Railway $1 credit | BFF as Node/Express; Vercel needs adapter (e.g. serverless functions). Railway: $1 free credit/month might cover a tiny BFF. |
| **Directus** | **Railway** ($1 credit) or **Render** (free tier) or **Fly.io** (free allowance) | **$0** if within free limits | Railway: $1/month credit can run a small Directus; may run out before month end. Render: free tier spins down after idle (first load slow). Fly.io: free tier has limited resources but can run one small VM. |

**Reality check:** “100% free forever” for all three is tight. **Neon Postgres is genuinely free** (no card, 0.5 GB). For BFF + Directus, one practical “almost free” combo is: **Neon (DB) + Railway** (BFF + Directus on the same project, sharing the $1/month credit – very light usage) or **Neon + Vercel (BFF) + Render (Directus, free tier with spin-down)**. If traffic stays low, you can stay at $0 for a while; if Railway credit runs out, you pay a few $/month.

### Option B: Very cheap (one place for everything)

| Component   | Where              | Cost (approx.) | Notes |
|------------|--------------------|----------------|--------|
| **Postgres + Directus + BFF** | **Railway** or **Render** or **Hetzner VPS** | **~$5–7/month** (Railway/Render) or **~€4–5/month** (Hetzner) | One project: Postgres + Directus + BFF. Railway/Render: managed, easy. Hetzner: one small VPS (e.g. CX22), you run Docker (Postgres + Directus + BFF); more control, no per-app fee. |

### Option C: Free at home (no cloud bill)

- **Postgres + Directus + BFF** on a **home machine** (old PC, Raspberry Pi, NAS with Docker). Expose with **Cloudflare Tunnel** (free) so admin.neosleepcare.com and api.neosleepcare.com point to your home IP without opening ports. **Cost:** $0 for hosting; only electricity and internet. Downside: machine must stay on and your internet stable.

---

## Recommended path (never done this before)

1. **Start with Neon (free)** for Postgres: sign up at neon.tech, create a project, copy the connection string. Use it in BFF and Directus. No cost, no card.
2. **Run BFF and Directus locally** first: same `DATABASE_URL` from Neon, run BFF (`pnpm dev` in services/bff) and Directus (Docker or `npx directus start`) on your machine. Point admin.neosleepcare.com to your PC only for testing (e.g. ngrok or Cloudflare Tunnel), or ignore domain until you deploy.
3. **When ready to expose admin + API:**  
   - **Cheapest managed:** Put BFF + Directus on **Railway** (one project, add Neon as external Postgres). Connect your GitHub, deploy. Set DNS so admin.neosleepcare.com → Railway Directus and api.neosleepcare.com → Railway BFF. Expect ~$5/month once past free credit, or try to stay within $1 credit.  
   - **Or** rent a **Hetzner CX22** (or similar) for ~€4/month and run Docker Compose (Postgres + Directus + BFF) there; then you have one bill and full control.
4. **GoDaddy:** Use it for **domain** (neosleepcare.com) and for **hosting the built rep/portal/website** (upload static build or use GoDaddy’s “aplikacje internetowe” if it supports static sites). In the app’s config set the API base URL to your BFF (e.g. https://api.neosleepcare.com).

---

## Four steps: concrete checklist

Use this as the order of work. Each step is done inside **this repo** (NeoSleep) except where a separate service (Neon, Railway, GoDaddy) is used.

### Step 1: Neon – Postgres in the cloud (free)

- Go to [neon.tech](https://neon.tech), sign up (no credit card).
- Create a **project** (e.g. "neosleep").
- In the dashboard, copy the **connection string** (PostgreSQL URL). It looks like:  
  `postgresql://user:password@ep-xxx.region.aws.neon.tech/neondb?sslmode=require`
- Save it; you will use it as `DATABASE_URL` for BFF and Directus.
- Optional: run our migrations so the DB has the same tables as locally. From repo root:
  ```bash
  psql "YOUR_NEON_CONNECTION_STRING" -f services/bff/migrations/001_initial.sql
  ```
  Or paste the contents of `services/bff/migrations/001_initial.sql` into Neon's SQL editor in the dashboard.

### Step 2: BFF and Directus locally (same DB = Neon)

- **BFF:** In `services/bff/.env` set `DATABASE_URL` to your Neon connection string. Run `pnpm dev` in `services/bff`. BFF will use Neon.
- **Directus:** Run Directus locally and point it at the same Neon URL.
  - **Option A – Docker:** Add Directus to the repo's `docker-compose.yml` (see "Directus in docker-compose" below) with Neon as DB, then `docker compose up -d directus`.
  - **Option B – npx:** `npx create-directus-project directus-local`, choose PostgreSQL, paste the Neon connection string.
- Open Directus in the browser (e.g. http://localhost:8055). Confirm you see the same data (e.g. table `tbl_leads` if you ran the migration).
- Rep-app: `pnpm dev` in `apps/rep-app`; set `VITE_BFF_URL=http://localhost:3000` if needed. Rep app talks only to BFF; BFF reads from Neon.

### Step 3: Expose admin + API (when ready for production/UAT)

- **Option A – Railway:** Create a project on [railway.app](https://railway.app). Add Neon as external Postgres. Deploy BFF and Directus from GitHub. Set env vars (`DATABASE_URL` = Neon, etc.). Point DNS: admin.neosleepcare.com → Directus, api.neosleepcare.com → BFF.
- **Option B – VPS (e.g. Hetzner):** Rent a small VM. Install Docker, run Postgres + BFF + Directus (or use Neon for Postgres and run only BFF + Directus). Configure firewall and DNS for admin.neosleepcare.com and api.neosleepcare.com.
- After DNS propagates, test admin.neosleepcare.com and api.neosleepcare.com from the rep app (set `VITE_BFF_URL=https://api.neosleepcare.com` in rep-app build env on GoDaddy).

### Step 4: GoDaddy – rep, portal, website

- **Domain:** In GoDaddy DNS create/update A or CNAME records so rep.neosleepcare.com, portal.neosleepcare.com, neosleepcare.com point to GoDaddy or to the IP they give for "aplikacje internetowe".
- **Deploy frontends:** Build the Vue apps in this repo (`pnpm build` per app). Upload the built output (e.g. `dist/`) to GoDaddy for each app.
- **API URL:** In each app's build-time config (e.g. `.env.production` or GoDaddy env), set `VITE_BFF_URL=https://api.neosleepcare.com`. Rebuild and redeploy.

---

## Where tables and migrations live (not in Vue)

- **Creating tables** (schema, migrations) belongs to the **backend** and lives in **this repo**, but **not inside the Vue apps** (rep-app, portal, website). Vue apps only call the BFF; they do not define or run SQL.
- **In this project:** Migrations are in **`services/bff/migrations/`** (e.g. `001_initial.sql`). That is the single source of truth for app tables (tbl_leads, and later users, samples, etc.). Directus adds its own tables (`directus_*`) when it runs against the same DB.
- So "tworzenie tabel w moim projekcie" = **yes, in the NeoSleep project**, in **`services/bff/migrations/`** – correct. Not in `apps/rep-app` or `apps/portal` (Vue is frontend only).

---

## Directus in docker-compose (optional, for local dev)

To run Directus next to Postgres and Adminer in this repo, add a service (adjust to [Directus Docker docs](https://docs.directus.io/installation/docker.html)):

```yaml
  directus:
    image: directus/directus:latest
    ports:
      - "8055:8055"
    environment:
      KEY: "your-random-key"
      SECRET: "your-random-secret"
      ADMIN_EMAIL: "admin@example.com"
      ADMIN_PASSWORD: "your-admin-password"
      DB_CLIENT: "pg"
      DB_HOST: "postgres"
      DB_PORT: "5432"
      DB_DATABASE: "neosleep"
      DB_USER: "neosleep"
      DB_PASSWORD: "neosleep_local"
      WEBSOCKETS_ENABLED: "true"
    depends_on:
      - postgres
```

Then `docker compose up -d` starts Postgres, Adminer, and Directus. Directus at http://localhost:8055. **In this repo** the `docker-compose.yml` already includes a `directus` service; before first run set at least `ADMIN_PASSWORD` (and optionally `KEY`/`SECRET`) in the file or via env. For Neon, set DB vars to Neon host instead of `postgres`.

---

## Open questions (optional)

- **Repo cleanup:** Remove `apps/admin` from the monorepo and deploy scripts, or keep as deprecated for now?
- **Directus + BFF on same Postgres:** BFF and Directus both use the same Neon (or other) connection string; Directus will create its `directus_*` tables in that DB. No extra setup except env vars.
