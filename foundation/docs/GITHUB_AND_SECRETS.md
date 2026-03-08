# GitHub repository and secrets

This document describes how to add the NeoSleep project to a **private** GitHub repository and keep all keys and secrets out of the repo. It also references production vs UAT domains (**neosleep.com** and **uat.neosleep.com**) on GoDaddy. See **DEPLOYMENT.md** for full domain and deployment layout.

## 1. Ensure no secrets are committed

Before initializing Git or pushing:

- **Never commit** `.env`, `.env.local`, `.env.production`, `.env.uat`, or any file containing real credentials.
- The repo includes **only** `.env.example` files (no real values). Copy them to `.env` locally and fill in real values; `.env` is in `.gitignore`.
- **Checked in** (safe): `services/bff/.env.example`, `apps/rep-app/.env.example`. Use these as templates: copy to `.env` (e.g. `cp services/bff/.env.example services/bff/.env`) and fill in real values only locally; never commit `.env`.

**.gitignore** already excludes:

- `.env`, `.env.*`, and explicit entries for `.env.local`, `.env.production`, `.env.uat`, etc.
- `*.pem`, `*.key`, `*.crt`, `secrets/`, `.secrets/`, `*.secret`, `*.credentials`

**Quick check before first push:**

```bash
git status
# Ensure no .env, .env.production, .env.uat, or key files appear. If they do, add them to .gitignore and unstage.
```

## 2. Create a private GitHub repository

1. On GitHub: **New repository**.
2. Name: e.g. `NeoSleep` or `neosleep` (your choice).
3. Set visibility to **Private**.
4. Do **not** initialize with README, .gitignore, or license (we already have them).
5. Copy the repo URL, e.g. `https://github.com/YOUR_ORG/NeoSleep.git` or `git@github.com:YOUR_ORG/NeoSleep.git`.

## 3. Initialize Git and push (first time)

From the project root (NeoSleep):

```bash
git init
git add .
git status   # again: confirm no .env or key files are staged
git commit -m "Initial commit: NeoSleep monorepo"
git branch -M main
git remote add origin https://github.com/YOUR_ORG/NeoSleep.git
# or: git remote add origin git@github.com:YOUR_ORG/NeoSleep.git
git push -u origin main
```

Replace `YOUR_ORG` with your GitHub username or organization.

## 4. Keeping keys and secrets safe

### Local development

- Use **only** `.env` (and optionally `.env.local`) on your machine; these are gitignored.
- Create `.env` by copying from `.env.example` and filling in real values. Never commit `.env`.

### CI (GitHub Actions)

- The existing **CI workflow** (`.github/workflows/ci.yml`) runs `pnpm ci` (lint, typecheck, test). It does **not** need secrets for that.
- If you add workflows that deploy or run migrations, use **GitHub Actions secrets**:
  - Repo: **Settings → Secrets and variables → Actions**.
  - Add secrets (e.g. `DATABASE_URL`, `SESSION_SECRET`, `GOOGLE_CLIENT_SECRET`). Reference them in the workflow as `${{ secrets.DATABASE_URL }}`.
- **Never** put secret values in workflow YAML or in code.

### Deployment (production / UAT)

- **Production** (neosleep.com) and **UAT** (uat.neosleep.com) need different env vars (different BFF URLs, DB, OAuth redirect URIs, etc.).
- Configure env per environment in your host (Vercel, Railway, etc.):
  - **Production**: e.g. `VITE_BFF_URL=https://api.neosleep.com`, `BFF_ORIGIN=https://api.neosleep.com`, `FRONTEND_URL=https://neosleep.com`, plus `DATABASE_URL`, `SESSION_SECRET`, `GOOGLE_CLIENT_*` for prod.
  - **UAT**: e.g. `VITE_BFF_URL=https://uat.api.neosleep.com`, `BFF_ORIGIN=https://uat.api.neosleep.com`, `FRONTEND_URL=https://uat.neosleep.com`, and UAT DB/OAuth credentials.
- Use the host's **environment** or **secrets** UI; do not store production/UAT secrets in the repo or in GitHub as plain text in workflows unless they are in **Secrets and variables → Actions**.

## 5. Domains: neosleep.com and uat.neosleep.com (GoDaddy)

Domains are managed in **GoDaddy**. DNS for production and UAT:

| Environment | Domain / subdomain   | Purpose        |
|-------------|----------------------|----------------|
| Production  | **neosleep.com**     | Main site      |
| UAT         | **uat.neosleep.com** | Test / staging |

In **GoDaddy**:

1. **DNS** for the domain (e.g. neosleep.com):
   - **neosleep.com** (root or www): point to your production host (e.g. Vercel, or your server). Use the host's recommended record (CNAME to `cname.vercel-dns.com` for Vercel, or A record).
   - **uat.neosleep.com**: point to your UAT host (e.g. Vercel preview/UAT target). Again CNAME or A as required by the host.
2. If you use subdomains (e.g. rep.neosleep.com, api.neosleep.com), add the corresponding CNAME or A records in GoDaddy for each.

After the first push, you can configure **GitHub** (e.g. branch protection, Actions secrets) and your **deploy host** (Vercel, etc.) to use these domains and keep all keys in the host's secrets or GitHub Actions secrets, not in the repository.

## 6. Summary

- **Private GitHub repo**: create it, then `git init`, add, commit, add `origin`, push.
- **Secrets**: only in local `.env` (gitignored), GitHub Actions secrets, or deploy-host env/secrets. Never commit `.env`, keys, or certs.
- **Domains**: neosleep.com (prod) and uat.neosleep.com (UAT) are set in GoDaddy DNS to point to your production and UAT hosts.

See **DEPLOYMENT.md** for the full list of apps, subdomains, and deployment options (Vercel, BFF, Directus).
