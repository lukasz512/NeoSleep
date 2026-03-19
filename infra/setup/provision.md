# Hetzner VPS Provisioning Runbook

One-time setup for the NeoSleep production server (CX22, Ubuntu 24.04 LTS).
Two environments share the same VPS: **PROD** (port 3000) and **UAT** (port 3001).

---

## 1. Create the VPS

1. Log in to [hetzner.com](https://hetzner.com) → Cloud → New Server
2. **Location**: Falkenstein (EU) or Helsinki
3. **Image**: Ubuntu 24.04 LTS
4. **Type**: CX22 (2 vCPU, 4 GB RAM, €4/mo)
5. **SSH Keys**: paste your local public key (`~/.ssh/id_ed25519.pub`)
6. Note the public IP — needed for DNS and GitHub Secrets

---

## 2. Initial Server Hardening

```bash
# SSH in as root
ssh root@<VPS_IP>

# Create deploy user
adduser deploy
usermod -aG sudo deploy

# Copy SSH authorized_keys from root to deploy
mkdir -p /home/deploy/.ssh
cp ~/.ssh/authorized_keys /home/deploy/.ssh/
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh

# Firewall: only SSH, HTTP, HTTPS
ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw enable

# Disable root SSH login
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
systemctl restart ssh
```

Verify: `ssh deploy@<VPS_IP>` (should work without password, root login should fail).

---

## 3. Install Stack

```bash
# As deploy user (sudo):

# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# pnpm 9
sudo npm install -g pnpm@9

# PM2
sudo npm install -g pm2
sudo pm2 startup systemd -u deploy --hp /home/deploy
# Run the command it prints

# PostgreSQL 15
sudo apt-get install -y postgresql-15

# Nginx + Certbot
sudo apt-get install -y nginx certbot python3-certbot-nginx

# rclone (for B2 backups)
curl https://rclone.org/install.sh | sudo bash
```

---

## 4. PostgreSQL Setup

```bash
sudo -u postgres psql <<'EOF'
CREATE USER neosleep WITH PASSWORD '<CHOOSE_STRONG_PASSWORD>';
CREATE DATABASE neosleep_prod OWNER neosleep;
CREATE DATABASE neosleep_uat  OWNER neosleep;
EOF
```

Test: `psql -U neosleep -d neosleep_prod -h localhost` (enter password when prompted).

---

## 5. Create App Directory Structure

```bash
mkdir -p /home/deploy/apps/{app-prod,app-uat,bff-prod,bff-uat}
mkdir -p /home/deploy/{scripts,logs}
```

---

## 6. BFF Environment Files

Create `/home/deploy/apps/bff-prod/.env`:
```
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://neosleep:<PASSWORD>@localhost/neosleep_prod
SESSION_SECRET=<generate: openssl rand -hex 32>
FRONTEND_URL=https://app.neosleepcare.com
GOOGLE_CLIENT_ID=<from Google Cloud Console>
GOOGLE_CLIENT_SECRET=<from Google Cloud Console>
GOOGLE_CALLBACK_URL=https://app.neosleepcare.com/auth/google/callback
```

Create `/home/deploy/apps/bff-uat/.env`:
```
NODE_ENV=production
PORT=3001
DATABASE_URL=postgresql://neosleep:<PASSWORD>@localhost/neosleep_uat
SESSION_SECRET=<generate: openssl rand -hex 32>
FRONTEND_URL=https://app-uat.neosleepcare.com
GOOGLE_CLIENT_ID=<from Google Cloud Console>
GOOGLE_CLIENT_SECRET=<from Google Cloud Console>
GOOGLE_CALLBACK_URL=https://app-uat.neosleepcare.com/auth/google/callback
```

Protect the files: `chmod 600 /home/deploy/apps/bff-prod/.env /home/deploy/apps/bff-uat/.env`

---

## 7. Google OIDC — Add Callback URLs

In [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials → your OAuth 2.0 Client:

Add to **Authorized redirect URIs**:
- `https://app.neosleepcare.com/auth/google/callback`
- `https://app-uat.neosleepcare.com/auth/google/callback`

---

## 8. Nginx Configuration

```bash
# Copy configs from repo
sudo cp infra/nginx/app.neosleepcare.com.conf     /etc/nginx/sites-available/
sudo cp infra/nginx/app-uat.neosleepcare.com.conf /etc/nginx/sites-available/

# Enable sites
sudo ln -s /etc/nginx/sites-available/app.neosleepcare.com.conf     /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/app-uat.neosleepcare.com.conf /etc/nginx/sites-enabled/

# Remove default site
sudo rm -f /etc/nginx/sites-enabled/default

# Test and reload
sudo nginx -t && sudo systemctl reload nginx
```

---

## 9. SSL Certificates

Point DNS first (step 11), then:

```bash
sudo certbot --nginx -d app.neosleepcare.com -d app-uat.neosleepcare.com
```

Certbot auto-renews via systemd timer — verify: `systemctl status certbot.timer`

---

## 10. PM2 Setup

```bash
# Copy ecosystem file
cp infra/nginx/ecosystem.config.cjs /home/deploy/ecosystem.config.cjs

# Start both BFF processes
cd /home/deploy
pm2 start ecosystem.config.cjs

# Save process list (survives reboots)
pm2 save
```

---

## 11. GitHub Secrets

In GitHub → repo Settings → Secrets → Actions, add:

| Secret | Value |
|---|---|
| `VPS_HOST` | Hetzner public IP |
| `VPS_SSH_KEY` | Private key for `deploy` user (generate a dedicated key pair) |

Keep existing: `VITE_BFF_URL_PROD`, `VITE_BFF_URL_UAT`

Remove old FTP secrets: `FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD`, `FTP_PATH_APP_PROD`, `FTP_PATH_APP_UAT`

---

## 12. Backblaze B2 Backup

1. Create a [Backblaze B2](https://www.backblaze.com/b2/cloud-storage.html) account
2. Create a bucket named `neosleep-backups` (private)
3. Create an application key with read/write access to that bucket
4. On the VPS: `rclone config` → type `b2` → enter Account ID and Application Key → name it `b2`
5. Install the backup script and cron:

```bash
cp infra/scripts/backup-db.sh /home/deploy/scripts/backup-db.sh
chmod +x /home/deploy/scripts/backup-db.sh

# Add cron job (every Sunday at 2am)
(crontab -l 2>/dev/null; echo "0 2 * * 0 /home/deploy/scripts/backup-db.sh >> /home/deploy/logs/backup.log 2>&1") | crontab -
```

Test: `bash /home/deploy/scripts/backup-db.sh`

---

## 13. DNS Cutover (GoDaddy)

> Lower TTL to 300s at least 1 hour before cutting over.

1. GoDaddy DNS → change `A` record for `app.neosleepcare.com` → Hetzner IP
2. Change `A` record for `app-uat.neosleepcare.com` → same Hetzner IP
3. Wait for propagation (~5 min with TTL 300)
4. After confirming everything works, raise TTL back to 3600s

---

## 14. Verification Checklist

```bash
curl https://app-uat.neosleepcare.com/health
# Expected: {"ok":true}

curl https://app.neosleepcare.com/health
# Expected: {"ok":true}

pm2 logs bff-prod --lines 20
pm2 logs bff-uat  --lines 20

psql -U neosleep -d neosleep_prod -c "\dt"
# Should show all 20+ tables after first BFF startup
```

- [ ] Login with Google on UAT works
- [ ] Session persists across page reload
- [ ] Push to `uat` branch → GitHub Action succeeds → new build visible on site
- [ ] Manual backup run completes without errors
- [ ] B2 bucket contains `.sql.gz` files

---

## Scale-out Path (when PROD needs its own VPS)

1. Hetzner → Snapshots → snapshot the CX22
2. Create new server (CX22 or CX32) from the snapshot
3. Update PROD `.env` with new DB connection (or restore DB to new server)
4. Update DNS `A` record for `app.neosleepcare.com` → new IP
5. Update `VPS_HOST` secret for PROD deploys (or use separate secrets per env)
6. On original VPS: drop `neosleep_prod` DB, remove `bff-prod` / `app-prod` dirs
