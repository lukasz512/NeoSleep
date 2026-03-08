# Deploy to GoDaddy via FTP (GitHub Actions)

The repo uses two GitHub Actions workflows to **build** and **upload** to GoDaddy over FTP. Only **two** projects are hosted:

| Project | Domains | Workflow |
|---------|---------|----------|
| **Site** (marketing) | **neosleepcare.com**, **uat.neosleepcare.com** | Deploy NeoSleepCare Site |
| **App** (rep-app) | **app.neosleepcare.com**, **app-uat.neosleepcare.com** | Deploy NeoSleepCare App |

| Workflow | Branch | Builds | FTP folder (secret) | Domain |
|----------|--------|--------|---------------------|--------|
| **Deploy NeoSleepCare Site** | `PROD` | `apps/website` | `FTP_PATH_WEBSITE_PROD` | neosleepcare.com |
| **Deploy NeoSleepCare Site** | `uat` | `apps/website` | `FTP_PATH_WEBSITE_UAT` | uat.neosleepcare.com |
| **Deploy NeoSleepCare App** | `PROD` | `apps/rep-app` | `FTP_PATH_APP_PROD` | app.neosleepcare.com |
| **Deploy NeoSleepCare App** | `uat` | `apps/rep-app` | `FTP_PATH_APP_UAT` | app-uat.neosleepcare.com |

- Push to **PROD** → both workflows deploy to **production** folders.
- Push to **uat** → both workflows deploy to **UAT** folders.
- You can also run a workflow manually: **Actions** → choose workflow → **Run workflow**.

Paths are set via **GitHub Secrets** so you can match the exact folder structure on GoDaddy FTP (see below).

---

## 1. How to find the correct FTP path (important)

If deploy runs but **folders on GoDaddy stay empty**, the `server-dir` path is wrong. Do this:

1. **Connect by FTP** (FileZilla, WinSCP, or cPanel → File Manager).
2. After login, look at the **remote (server) side**:
   - You often see a home folder with e.g. `public_html`, `www`, `domains`, or similar.
   - GoDaddy/cPanel often: your home = something like `/home/username` and the web root is `public_html`.
3. **Choose or create the target folder** (e.g. for the main site):
   - Go into `public_html` (or the folder that is the web root for your domain).
   - Create a subfolder if needed, e.g. `neosleepcare-site-prod`.
   - The **full path** you need in the secret is the path from the **FTP login root** to that folder.
4. **Try these path formats** in the GitHub secret (one of them will work):
   - **Relative, no leading slash:** `public_html/neosleepcare-site-prod` or `public_html/neosleepcare-site-prod/`
   - **With leading slash:** `/public_html/neosleepcare-site-prod` or `/public_html/neosleepcare-site-prod/`
   - **If your FTP root is already inside public_html:** `neosleepcare-site-prod` or `neosleepcare-site-prod/`
5. After setting the secret, run the workflow again and check the same folder on FTP – files should appear.

Use the **exact same path** you see when you open that folder in your FTP client (or File Manager). Copy the path from the address bar if possible.

---

## 2. Get FTP details from GoDaddy

1. Log in to **GoDaddy** → **Web Hosting** or **cPanel**.
2. Open **FTP** / **FTP Accounts**.
3. Note:
   - **FTP server** (e.g. `ftp.neosleepcare.com`).
   - **FTP username**
   - **FTP password**

---

## 3. Add GitHub Secrets (9 in total)

1. On GitHub: repo **NeoSleep** → **Settings** → **Secrets and variables** → **Actions**.
2. **New repository secret** for each:

| Secret | Description | Example |
|--------|-------------|---------|
| `FTP_SERVER` | FTP host (or IP) from GoDaddy | `ftp.neosleepcare.com` or `97.74.144.xxx` |
| `FTP_USERNAME` | FTP user | `your_ftp_user` |
| `FTP_PASSWORD` | FTP password | (paste password) |
| `FTP_PATH_WEBSITE_PROD` | Remote path for site PROD | `public_html/neosleepcare-site-prod` or `/public_html/neosleepcare-site-prod` |
| `FTP_PATH_WEBSITE_UAT` | Remote path for site UAT | `public_html/neosleepcare-site-uat` |
| `FTP_PATH_APP_PROD` | Remote path for app PROD | `public_html/neosleepcare-app-prod` |
| `FTP_PATH_APP_UAT` | Remote path for app UAT | `public_html/neosleepcare-app-uat` |

| `VITE_BFF_URL_PROD` | BFF API URL for production (used at **build** time so app calls the right API) | `https://api.neosleepcare.com` |
| `VITE_BFF_URL_UAT` | BFF API URL for UAT (used at **build** time) | `https://api-uat.neosleepcare.com` or your UAT API URL |

Use the **exact path** you see in your FTP client when you open the target folder (see section 1). Try without leading `/` first; if deploy still goes to the wrong place, try with `/`.

---

## 4. GoDaddy: point subdomains to the right folders

In **GoDaddy** (or cPanel) set each (sub)domain’s **document root** to the folder the workflow uploads to:

| Domain | Document root (folder) |
|--------|------------------------|
| **neosleepcare.com** (and www) | `public_html/neosleepcare-site-prod` (or `/public_html/neosleepcare-site-prod/`) |
| **uat.neosleepcare.com** | `public_html/neosleepcare-site-uat` |
| **app.neosleepcare.com** | `public_html/neosleepcare-app-prod` |
| **app-uat.neosleepcare.com** | `public_html/neosleepcare-app-uat` |

Exact names depend on your hosting (Subdomains / Addon Domains in cPanel). The folder name must match what’s in the FTP_PATH_* secret.

---

## 4. Branches: PROD and uat

Workflows run on push to **PROD** (production) and **uat** (UAT). If you need to create **uat**:

```bash
git checkout -b uat
git push -u origin uat
```

Then: push to **PROD** → prod deploy; push to **uat** → UAT deploy.

---

## 6. Workflow files

- **Site:** `.github/workflows/deploy-website.yml` – name: **Deploy NeoSleepCare Site**. Build: `pnpm run build:website` → `apps/website/dist/`.
- **App:** `.github/workflows/deploy-app.yml` – name: **Deploy NeoSleepCare App**. Build: `pnpm run build:rep-app` → `apps/rep-app/dist/`.

Both use [SamKirkland/FTP-Deploy-Action](https://github.com/SamKirkland/FTP-Deploy-Action) with `protocol: ftp` and `dangerous-clean-slate: false`. They run on **push** to `PROD`/`uat` and can be started manually via **workflow_dispatch**.

---

## 7. Troubleshooting

- **App loads but API calls fail / network errors:** The rep-app build must have the correct BFF URL. Add GitHub Secrets **`VITE_BFF_URL_PROD`** and **`VITE_BFF_URL_UAT`** (e.g. `https://api.neosleepcare.com` and your UAT API URL). Re-run the deploy workflow so the app is built with the right URL.
- **404 when refreshing a subpage (e.g. /dashboard):** The server must serve `index.html` for SPA routes. The repo includes `apps/rep-app/public/.htaccess`; it is copied to `dist/` on build. Ensure GoDaddy is using Apache and that `mod_rewrite` is enabled for the app folder.
- **Cannot log in with Google:** See **foundation/docs/LOGIN_AFTER_DEPLOY.md** for BFF env vars, Google OAuth redirect URI, and CORS/cookies.
- **FTP login failed:** Check `FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD` (no typos).
- **Folders empty on FTP / 403 on site:** The path in the secret is wrong. Follow **section 1** to find the correct path on GoDaddy and set `FTP_PATH_WEBSITE_PROD`, `FTP_PATH_WEBSITE_UAT`, `FTP_PATH_APP_PROD`, `FTP_PATH_APP_UAT` to that exact path (try without leading `/` first, then with `/`).
- **404 / wrong site:** In GoDaddy/cPanel, set each (sub)domain’s **document root** to the same folder you use in the corresponding `FTP_PATH_*` secret.
