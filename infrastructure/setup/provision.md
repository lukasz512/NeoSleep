# Hetzner VPS provisioning — API server (apps/api)

> **Status: not active.** The API server currently deploys to Render (`render.yaml`,
> free tier — see `infrastructure/scripts/render-keepalive.gs` for the
> keep-alive ping). This runbook is the scale-up path for when Render's free
> tier stops being enough (real field pilot, need for always-on without a
> keep-alive hack, need for background jobs, etc.) — come back to this when
> that day arrives, don't run it in parallel with Render.

Runbook to stand up a Hetzner Cloud server with PM2 processes `api-prod` /
`api-uat`, SSH deploy as user `deploy`.

Scope: **API server only**. `apps/pwa` and `apps/web` keep deploying to GoDaddy via FTP
until a separate migration. `infrastructure/docker-compose.prod.yml` +
`infrastructure/nginx/default.conf` are an older, unused Docker-based approach —
this runbook uses PM2 + host nginx instead (see `infrastructure/nginx/api-host.conf`).

## 1. Create the server

Use the **Cloud Console** (console.hetzner.cloud), not the Accounts billing panel.

- New project → Add server
- Location: Nuremberg or Falkenstein (closest to PL; MX traffic is fine over EU)
- Image: Ubuntu 24.04 LTS
- Type: CAX11 (ARM, 2 vCPU / 4GB) or CX22 (x86) — either is enough for two small Node processes
- SSH key: generate one locally first if you don't have one:
  ```bash
  ssh-keygen -t ed25519 -C "neosleep-deploy" -f ~/.ssh/neosleep_deploy
  ```
  Paste `~/.ssh/neosleep_deploy.pub` into the Hetzner "SSH keys" step when creating the server.
- Create → note the server's public IP.

## 2. First connect + hardening

```bash
ssh -i ~/.ssh/neosleep_deploy root@<SERVER_IP>

# create the deploy user the workflow expects
adduser --disabled-password --gecos "" deploy
usermod -aG sudo deploy
mkdir -p /home/deploy/.ssh
cp ~/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh && chmod 600 /home/deploy/.ssh/authorized_keys

# firewall
ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw enable

# disable root SSH login and password auth (key-only)
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart sshd
```

From now on, connect as `ssh -i ~/.ssh/neosleep_deploy deploy@<SERVER_IP>`.

## 3. Install runtime

```bash
# Node 20 (matches .nvmrc and apps/api/Dockerfile's node:20-alpine)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

sudo corepack enable
sudo npm install -g pm2

sudo apt-get install -y nginx certbot python3-certbot-nginx
```

## 4. Directory structure

```bash
mkdir -p /home/deploy/apps/api-prod /home/deploy/apps/api-uat
```

## 5. Environment files (never committed, created directly on the server)

Create `/home/deploy/apps/api-prod/.env` and `/home/deploy/apps/api-uat/.env` with:

```
NODE_ENV=production
PORT=3000                          # 3001 for uat
DATABASE_URL=                      # Supabase connection string
FRONTEND_URL=                      # comma-separated allowed origins (app.neosleepcare.com, ...)
SESSION_SECRET=                    # long random string, different per env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
OAUTH_REDIRECT_ORIGIN=
GMAIL_USER=
GMAIL_APP_PASSWORD=
GMAIL_TO=
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=
DEFAULT_TENANT_SLUG=
INITIAL_USER_PASSWORD=             # set for any seeded staff account with no password yet
```

Lock down permissions: `chmod 600 /home/deploy/apps/api-*/.env`.

## 6. PM2

Copy `infrastructure/pm2/ecosystem.config.json` to `/home/deploy/ecosystem.config.json`
on the server (scp it once manually — it's not part of the CI deploy payload).

```bash
cd /home/deploy
pm2 start ecosystem.config.json
pm2 save
pm2 startup systemd    # run the printed command as root to survive reboots
```

Note: the first start will fail until `dist/server.js` exists in each app dir —
that's what the CI deploy step uploads. Run one manual deploy first (step 8)
before relying on `pm2 restart`.

## 7. DNS

Add **new** A records at the current DNS provider (GoDaddy) — this does not touch
existing `app.` / `www.` records, so it's safe to do without a maintenance window:

```
api.neosleepcare.com      A    <SERVER_IP>
api-uat.neosleepcare.com  A    <SERVER_IP>
```

Wait for propagation (`dig api.neosleepcare.com`) before requesting certs.

## 8. nginx + TLS

```bash
sudo cp infrastructure/nginx/api-host.conf /etc/nginx/sites-available/api
sudo ln -s /etc/nginx/sites-available/api /etc/nginx/sites-enabled/api
sudo rm -f /etc/nginx/sites-enabled/default

sudo certbot --nginx -d api.neosleepcare.com -d api-uat.neosleepcare.com
sudo nginx -t && sudo systemctl reload nginx
```

## 9. GitHub Actions secrets

Repo → Settings → Secrets and variables → Actions:

| Secret | Value |
|---|---|
| `VPS_HOST` | server public IP or hostname |
| `VPS_SSH_KEY` | private key contents of `~/.ssh/neosleep_deploy` (the `deploy` user's key) |

## 10. First real deploy

Push to `dev` branch (or `workflow_dispatch` the `Deploy API` action) first, verify
`https://api-dev.neosleepcare.com/health`, then repeat for `prod`.

## 11. Update frontend env

`RENDER_API_URL_DEV` / `RENDER_API_URL_PROD` (used by `deploy-pwa.yml`) need to
point at `https://api-dev.neosleepcare.com` / `https://api.neosleepcare.com`
once this is live, and `FRONTEND_URL` in each `.env` above needs the matching
PWA origin so CORS + session cookies keep working.
