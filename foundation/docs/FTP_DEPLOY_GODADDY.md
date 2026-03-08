# Deploy to GoDaddy via FTP (GitHub Actions)

The repo uses two GitHub Actions workflows to **build** the site and app and **upload** the build output to GoDaddy over FTP:

| Workflow | Branch | Builds | FTP target (secret) | Domain |
|----------|--------|--------|----------------------|--------|
| **Deploy Website** | `main` | `apps/website` | `FTP_PATH_WEBSITE_PROD` | **neosleepcare.com** |
| **Deploy Website** | `uat` | `apps/website` | `FTP_PATH_WEBSITE_UAT` | **uat.neosleepcare.com** |
| **Deploy App** | `main` | `apps/rep-app` | `FTP_PATH_APP_PROD` | **app.neosleepcare.com** |
| **Deploy App** | `uat` | `apps/rep-app` | `FTP_PATH_APP_UAT` | **uat.app.neosleepcare.com** |

- Push to **main** → website and app deploy to **production** paths.
- Push to **uat** → website and app deploy to **UAT** paths.

You must add **GitHub Secrets** and configure **GoDaddy FTP** (and optionally create branch `uat`) as below.

---

## 1. Get FTP details from GoDaddy

1. Log in to **GoDaddy** → your product (e.g. **Web Hosting** or **cPanel**).
2. Open **FTP** or **FTP Accounts** (in cPanel or GoDaddy hosting dashboard).
3. Note:
   - **FTP server** (e.g. `ftp.neosleepcare.com` or the host GoDaddy shows).
   - **FTP username** (e.g. the account you create or the main account).
   - **FTP password** (create a strong password if you create a new FTP user).

4. Decide the **remote folders** where files will go. Often:
   - **Main site (neosleepcare.com):** `public_html` or `/` (root of the domain).
   - **UAT site (uat.neosleepcare.com):** e.g. `uat` or `public_html/uat` (depends how GoDaddy maps subdomains to folders).
   - **App (app.neosleepcare.com):** e.g. `app` or `public_html/app`.
   - **UAT app (uat.app.neosleepcare.com):** e.g. `uat.app` or `public_html/uat.app`.

If you’re unsure, check in GoDaddy/cPanel how subdomains are mapped to directories (e.g. “Subdomains” or “Addon Domains”) and use those paths.

---

## 2. Add GitHub Secrets

1. On GitHub open the repo **NeoSleep**.
2. Go to **Settings → Secrets and variables → Actions**.
3. Click **New repository secret** and add:

| Secret name | Description | Example |
|-------------|-------------|---------|
| `FTP_SERVER` | FTP host from GoDaddy | `ftp.neosleepcare.com` |
| `FTP_USERNAME` | FTP user | `your_ftp_user` |
| `FTP_PASSWORD` | FTP password | (paste password) |
| `FTP_PATH_WEBSITE_PROD` | Remote folder for neosleepcare.com | `public_html` or `/` |
| `FTP_PATH_WEBSITE_UAT` | Remote folder for uat.neosleepcare.com | `uat` or `public_html/uat` |
| `FTP_PATH_APP_PROD` | Remote folder for app.neosleepcare.com | `app` or `public_html/app` |
| `FTP_PATH_APP_UAT` | Remote folder for uat.app.neosleepcare.com | `uat.app` or `public_html/uat.app` |

- Paths are **relative to the FTP user’s home** (often the account root). No leading slash unless your server expects it (e.g. `/public_html`).
- Use the exact folder names your hosting uses for each (sub)domain.

---

## 3. Create the `uat` branch (for UAT deploys)

UAT workflows run on push to branch **uat**. If you don’t have it yet:

```bash
git checkout -b uat
git push -u origin uat
```

From then on:

- Push to **main** → production FTP (neosleepcare.com + app.neosleepcare.com).
- Push to **uat** → UAT FTP (uat.neosleepcare.com + uat.app.neosleepcare.com).

---

## 4. Point domains to the right folders (GoDaddy)

In **GoDaddy** (or cPanel):

- **neosleepcare.com** (and www if needed) → document root = folder you set in `FTP_PATH_WEBSITE_PROD` (e.g. `public_html`).
- **uat.neosleepcare.com** → document root = folder in `FTP_PATH_WEBSITE_UAT` (e.g. `uat` or `public_html/uat`).
- **app.neosleepcare.com** → document root = folder in `FTP_PATH_APP_PROD`.
- **uat.app.neosleepcare.com** → document root = folder in `FTP_PATH_APP_UAT`.

So the **same** FTP paths you put in GitHub Secrets must be the ones GoDaddy uses as the web root for each (sub)domain.

---

## 5. Workflow files (reference)

- **Website:** `.github/workflows/deploy-website.yml` – builds `pnpm run build:website` → `apps/website/dist/` → FTP.
- **App:** `.github/workflows/deploy-app.yml` – builds `pnpm run build:rep-app` → `apps/rep-app/dist/` → FTP.

Both use [SamKirkland/FTP-Deploy-Action](https://github.com/SamKirkland/FTP-Deploy-Action). No secrets are stored in the repo; they are read from GitHub Actions secrets.

---

## 6. Troubleshooting

- **“Repository not found” / 403:** Not related to FTP; fix GitHub auth (see GITHUB_AND_SECRETS.md).
- **FTP login failed:** Check `FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD` (no typos, correct account).
- **Files in wrong place:** Adjust `FTP_PATH_*` to match the exact directories used by your hosting for each domain/subdomain.
- **404 / wrong site after deploy:** Confirm in GoDaddy/cPanel that each domain’s document root points to the folder you deploy into (same as the corresponding `FTP_PATH_*` secret).
