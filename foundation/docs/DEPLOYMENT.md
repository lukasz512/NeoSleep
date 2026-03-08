# Deployment – domains and environments

Website, rep, portal, BFF, and **admin (Directus)**. Production and UAT use the same structure with different subdomains. **Domains are on GoDaddy**: production = **neosleep.com**, UAT = **uat.neosleep.com**. **Admin panel = Directus** (self-hosted), not the Vue app in apps/admin – see **foundation/docs/DIRECTUS_AS_ADMIN.md**.

For adding the repo to GitHub and keeping secrets safe, see **foundation/docs/GITHUB_AND_SECRETS.md**.

## Domains (production) – neosleep.com (GoDaddy)

| App     | URL                      | Purpose                    |
|---------|--------------------------|----------------------------|
| Website | **neosleep.com**         | Marketing, public          |
| Rep     | **rep.neosleep.com**     | Rep app                    |
| Admin   | **admin.neosleep.com**   | Directus (self-hosted)     |
| Portal  | **portal.neosleep.com**  | HCP/client portal          |

BFF can be e.g. **api.neosleep.com** (or same origin per app if you use a single domain with path-based routing).

## Domains (UAT / test) – uat.neosleep.com (GoDaddy)

Same structure with **uat.** prefix:

| App     | UAT URL                         |
|---------|----------------------------------|
| Website | **uat.neosleep.com**             |
| Rep     | **uat.rep.neosleep.com**         |
| Admin   | **uat.admin.neosleep.com**       |
| Portal  | **uat.portal.neosleep.com**      |

BFF UAT: e.g. **uat.api.neosleep.com**.

## DNS (GoDaddy)

- In **GoDaddy** DNS for neosleep.com: add CNAME (or A) records for each host above, pointing to your deployment host (e.g. Vercel).
- **neosleep.com** (and www if needed) → production.
- **uat.neosleep.com** → UAT / staging target.
- Add subdomains (rep, admin, portal, api, uat.rep, etc.) as required by your host.

## Deploying the apps (recommended: Vercel for frontends)

Monorepo has three deployable frontends under `apps/` (admin is Directus, not in apps/):

- `apps/website` → neosleep.com (prod), uat.neosleep.com (UAT)
- `apps/rep-app` → rep.neosleep.com, uat.rep.neosleep.com
- `apps/portal` → portal.neosleep.com, uat.portal.neosleep.com

**Admin:** Directus runs separately (Docker on VPS or chosen host); admin.neosleep.com points to that instance. See DIRECTUS_AS_ADMIN.md.

### Option A: One Vercel project per app (recommended)

1. In Vercel: add **4 projects**, each linked to the same GitHub repo.
2. For each project set **Root Directory** to the app folder, e.g. `apps/rep-app`.
3. Build command: `cd ../.. && pnpm install --frozen-lockfile && pnpm exec vite build --config apps/rep-app/vite.config.ts` (or use a root script that builds one app).
4. Output: each app’s `dist` is in `apps/<app>/dist` after `vite build` from that directory. In Vercel, set **Output Directory** to `dist` (relative to Root Directory).
5. **Environments**: for each project add **Production** (branch `main`) and **Preview** or **UAT** (branch `uat` or a dedicated branch). Assign custom domains:
   - Production: e.g. `rep.neosleep.com`
   - UAT: e.g. `uat.rep.neosleep.com` (via branch or env).

Add root-level scripts so Vercel can build from repo root with root Directory = app folder. Example in root `package.json`:

```json
"build:website": "pnpm --filter @neo/website build",
"build:rep-app": "pnpm --filter @neo/rep-app build",
"build:admin": "pnpm --filter @neo/admin build",
"build:portal": "pnpm --filter @neo/portal build"
```

If Vercel runs with Root Directory = `apps/rep-app`, the build command can be `pnpm install --frozen-lockfile && pnpm run build` from repo root (Vercel runs from root by default; override root to `apps/rep-app` and use `pnpm run build` only in that folder, or run from root with `--filter`).

Simpler: set Root Directory to the app (e.g. `apps/rep-app`), Build Command to `pnpm run build` (Vercel will run from that subdirectory; you may need to run `pnpm install` from root first – then use “Root Directory” = `.` and Build = `pnpm run build:rep-app` and Output = `apps/rep-app/dist`).

### Option B: Single Vercel project with multiple outputs (CRU)

Vercel doesn’t support multiple domains → multiple outputs in one project. So use **Option A** (one project per app).

### GitHub Actions (optional)

- On push to `main`: trigger production deploys (or rely on Vercel’s Git integration).
- On push to `uat`: deploy to UAT domains.
- In Actions you can call Vercel API or use `vercel deploy --prod` / `vercel deploy` per app with the right `--cwd` and env.

## Environment variables per app

- **VITE_BFF_URL** (or similar): BFF base URL (e.g. `https://api.neosleep.com` for prod, `https://uat.api.neosleep.com` for UAT).
- **VITE_APP_ENV**: `production` | `uat` | `development` (so app can hide dev-only features and use correct API).

## DNS

- Add CNAME (or A) for each host: `neosleep.com`, `rep.neosleep.com`, `admin.neosleep.com`, `portal.neosleep.com`, and `uat.*` / `uat.rep.*` etc., pointing to Vercel (or your host). Configure these in **GoDaddy** DNS.
- BFF: point `api.neosleep.com` and `uat.api.neosleep.com` to the server or serverless that runs the BFF.

## Summary

- **Prod**: neosleep.com, rep/admin/portal.neosleep.com (+ api).
- **UAT**: uat.neosleep.com, uat.rep/admin/portal.neosleep.com (+ uat.api).
- **Deploy**: one Vercel project per app, custom domains per environment; BFF deployed separately (e.g. Railway, Render, or same host as API).
