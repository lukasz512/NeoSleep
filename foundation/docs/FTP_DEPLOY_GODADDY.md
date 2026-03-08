# Deploy to GoDaddy via FTP (GitHub Actions)

The repo uses two GitHub Actions workflows to **build** and **upload** to GoDaddy over FTP. Only **two** projects are hosted:

| Project | Domains | Workflow |
|---------|---------|----------|
| **Site** (marketing) | **neosleepcare.com**, **uat.neosleepcare.com** | Deploy NeoSleepCare Site |
| **App** (rep-app) | **app.neosleepcare.com**, **app-uat.neosleepcare.com** | Deploy NeoSleepCare App |

| Workflow | Branch | Builds | FTP folder | Domain |
|----------|--------|--------|------------|--------|
| **Deploy NeoSleepCare Site** | `main` | `apps/website` | `/public_html/neosleepcare-site-prod/` | neosleepcare.com |
| **Deploy NeoSleepCare Site** | `uat` | `apps/website` | `/public_html/neosleepcare-site-uat/` | uat.neosleepcare.com |
| **Deploy NeoSleepCare App** | `main` | `apps/rep-app` | `/public_html/neosleepcare-app-prod/` | app.neosleepcare.com |
| **Deploy NeoSleepCare App** | `uat` | `apps/rep-app` | `/public_html/neosleepcare-app-uat/` | app-uat.neosleepcare.com |

- Push to **main** → both workflows deploy to **production** folders.
- Push to **uat** → both workflows deploy to **UAT** folders.
- You can also run a workflow manually: **Actions** → choose workflow → **Run workflow**.

FTP paths are **fixed in the workflow files**; you only need **three** GitHub Secrets.

---

## 1. Get FTP details from GoDaddy

1. Log in to **GoDaddy** → **Web Hosting** or **cPanel**.
2. Open **FTP** / **FTP Accounts**.
3. Note:
   - **FTP server** (e.g. `ftp.neosleepcare.com`).
   - **FTP username**
   - **FTP password**

---

## 2. Add GitHub Secrets (only 3)

1. On GitHub: repo **NeoSleep** → **Settings** → **Secrets and variables** → **Actions**.
2. **New repository secret** for each:

| Secret | Description | Example |
|--------|-------------|---------|
| `FTP_SERVER` | FTP host from GoDaddy | `ftp.neosleepcare.com` |
| `FTP_USERNAME` | FTP user | `your_ftp_user` |
| `FTP_PASSWORD` | FTP password | (paste password) |

No path secrets: server directories are set in the workflow YAML (`/public_html/neosleepcare-site-prod/`, etc.).

---

## 3. GoDaddy: point subdomains to the right folders

In **GoDaddy** (or cPanel) set each (sub)domain’s **document root** to the folder the workflow uploads to:

| Domain | Document root (folder) |
|--------|------------------------|
| **neosleepcare.com** (and www) | `public_html/neosleepcare-site-prod` (or `/public_html/neosleepcare-site-prod/`) |
| **uat.neosleepcare.com** | `public_html/neosleepcare-site-uat` |
| **app.neosleepcare.com** | `public_html/neosleepcare-app-prod` |
| **app-uat.neosleepcare.com** | `public_html/neosleepcare-app-uat` |

Exact names depend on your hosting (Subdomains / Addon Domains in cPanel). The folder name must match what’s in the workflow `server-dir`.

---

## 4. Create the `uat` branch (for UAT deploys)

If you don’t have branch **uat** yet:

```bash
git checkout -b uat
git push -u origin uat
```

Then: push to **main** → prod deploy; push to **uat** → UAT deploy.

---

## 5. Workflow files

- **Site:** `.github/workflows/deploy-website.yml` – name: **Deploy NeoSleepCare Site**. Build: `pnpm run build:website` → `apps/website/dist/`.
- **App:** `.github/workflows/deploy-app.yml` – name: **Deploy NeoSleepCare App**. Build: `pnpm run build:rep-app` → `apps/rep-app/dist/`.

Both use [SamKirkland/FTP-Deploy-Action](https://github.com/SamKirkland/FTP-Deploy-Action) with `protocol: ftp` and `dangerous-clean-slate: false`. They run on **push** to `main`/`uat` and can be started manually via **workflow_dispatch**.

---

## 6. Troubleshooting

- **FTP login failed:** Check `FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD` (no typos).
- **404 / wrong site:** In GoDaddy/cPanel, ensure each (sub)domain’s document root is the folder used in the workflow (`neosleepcare-site-prod`, `neosleepcare-site-uat`, `neosleepcare-app-prod`, `neosleepcare-app-uat`).
- **Change paths:** Edit `server-dir` in `.github/workflows/deploy-website.yml` and `.github/workflows/deploy-app.yml`, then update the subdomain document roots in GoDaddy to match.
