# Infrastructure map

Where each part of the system actually runs, and where to look when something's down.
This file is committed (searchable in the repo) and describes **what exists and how
it fits together**. It intentionally does not contain logins, passwords, or API
tokens — for "which account/email owns this" and actual credentials, see
`secrets/accounts.md` and `secrets/deploy-notes.md` (both gitignored, local-only,
ask a teammate for a copy if you don't have one).

## Domain & DNS

- Registrar: **GoDaddy** (`neosleepcare.com`)
- DNS: **Cloudflare**, dedicated `neosleepcare@gmail.com` account (moved off a
  personal account 2026-08-17 — see Incident log). Registrar nameservers are
  delegated to Cloudflare; DNS records, not the domain registration itself,
  live there.
- ⚠️ **Nameserver names are not a fingerprint for account ownership.** Cloudflare
  reuses nameserver pairs (e.g. `*.ns.cloudflare.com`) across unrelated customer
  accounts. Seeing the same pair on two zones does not mean they're on the same
  account.
- ⚠️ **Free Cloudflare SSL does not cover two-level subdomains.** Universal SSL
  only issues for the apex + one level of wildcard (`neosleepcare.com`,
  `*.neosleepcare.com`). Something like `pwa.dev.neosleepcare.com` is *two*
  levels deep and gets no certificate — DNS resolves fine, but HTTPS fails with
  an SSL handshake error, which looks nothing like a DNS problem and is easy to
  misdiagnose. Fix: use a hyphen instead of a second dot (`pwa-dev`, not
  `pwa.dev`) so it stays one level deep, OR pay for Cloudflare Advanced
  Certificate Manager. This project uses the hyphen convention — see naming
  table below.

### Current DNS records (verified 2026-08-17, post-migration)

| Name | Type | Content | Proxied | Purpose |
|---|---|---|---|---|
| `neosleepcare.com` (apex) | A | `68.178.244.120` | yes | Website — PROD |
| `www.neosleepcare.com` | A | `68.178.244.120` | yes | Website — PROD |
| `dev.neosleepcare.com` | A | `68.178.244.120` | yes | Website — DEV |
| `pwa.neosleepcare.com` | A | `68.178.244.120` | yes | PWA — PROD |
| `pwa-dev.neosleepcare.com` | A | `68.178.244.120` | yes | PWA — DEV |
| `cpanel.neosleepcare.com` | A | `68.178.244.120` | yes | cPanel admin access |
| `mail.neosleepcare.com` | A | `68.178.244.120` | yes | Mail |
| `webdisk.neosleepcare.com` | A | `68.178.244.120` | yes | cPanel WebDAV file access |
| `whm.neosleepcare.com` | A | `68.178.244.120` | yes | WHM panel |
| `autodiscover.neosleepcare.com` | CNAME | Outlook autodiscover | yes | Outlook client autoconfig |
| `email.neosleepcare.com` | CNAME | `email.secureserver.net` | yes | GoDaddy webmail |
| `webdisk.autoconfig...` | CNAME | apex | yes | cPanel auto-provisioned |
| MX | MX | `neosleepcare-com.mail.protection.outlook.com` | — | Email routing (Microsoft 365) |
| TXT | TXT | `v=spf1 include:secureserver.net -all` | — | SPF |
| TXT | TXT | `NETORGFT20350715.onmicrosoft.com` | — | Microsoft domain verification |
| TXT | TXT (`_dmarc`) | `v=DMARC1; ...` | — | DMARC |

`68.178.244.120` is the GoDaddy shared-hosting origin IP behind every proxied
record above — one physical hosting account, cPanel routes by hostname to the
right document root (see Hosting section).

**Legacy records removed during the 2026-08-17 migration** (not recreated —
confirmed unused): `admin.*`, `app.*` (old pre-rename name for the PWA — see
note in `secrets/deploy-notes.md`), `uat.*` (UAT is formally removed from the
project per `CLAUDE.md` until reintroduced), `sip.*` / `_sipfederationtls` /
`_sip._tls` SRV (old Skype for Business / VOIP federation, unrelated to this
project).

## Hosting

- **`apps/pwa`, `apps/web`**: static build, deployed via FTP to **GoDaddy shared
  hosting** (cPanel), one physical account, four document roots (`pwa/prod`,
  `pwa/dev`, `web/prod`, `web/dev`). See `.github/workflows/deploy-pwa.yml` /
  `deploy-web.yml` for the CI deploy steps, `secrets/deploy-notes.md` for the
  document-root mapping and FTP account history.
- **`apps/api`**: **Render** (`render.yaml`), currently tracking the `dev`
  branch for both environments (see comment at top of `render.yaml` — switch to
  `prod` once verified). A git push to the tracked branch is the whole deploy
  pipeline, no separate CD tooling.
  - Future scale-up path (not active): Hetzner VPS + PM2 + nginx, see
    `infrastructure/setup/provision.md`.
- **Database**: **Supabase** (managed PostgreSQL), schema-per-tenant. Connection
  string is `DATABASE_URL` on the Render service, never in frontend code.

## Where credentials live

- `secrets/accounts.md` — registry of which login/email owns each external
  service (Cloudflare, GoDaddy, GitHub, Render, Supabase, Google Cloud, Gmail
  SMTP). Start here when you don't know which account to log into.
- `secrets/deploy-notes.md` — GoDaddy/cPanel specifics: FTP accounts, document
  roots, and incident history for that side.
- Actual API keys/secrets for the API server: Render dashboard → `neosleep-bff`
  → Environment tab (`sync: false` in `render.yaml` means "set once in Render,
  never committed").
- GitHub Actions secrets: repo → Settings → Secrets and variables → Actions.

Both `secrets/*.md` files are gitignored on purpose (`secrets/` is in
`.gitignore`) — they hold operational detail that shouldn't be public in the
repo, but the *existence and structure* of this infra should be discoverable by
any dev, which is what this file is for.

## Incident log

- **2026-08-17 — PWA prod + both dev environments unreachable.**
  `pwa.neosleepcare.com`, `dev.neosleepcare.com`, and `pwa.dev.neosleepcare.com`
  had no DNS record at all (only the prod website root/`www` resolved). Root
  cause: records were never created when those environments were first stood
  up — not a deploy failure, not an expiry.
  - While investigating, found the Cloudflare zone was sitting under a
    personal account (`lukasz512`) rather than a project account — decided to
    migrate the zone to a dedicated `neosleepcare@gmail.com` Cloudflare
    account rather than just patch the missing records in place.
  - Migration: added the zone under the new account, let Cloudflare's importer
    scan existing records, corrected two records the importer got wrong (apex
    + `www` A records had imported as Cloudflare's own edge IPs instead of the
    real GoDaddy origin — an artifact of scanning a domain that's already
    proxied through a *different* Cloudflare account), dropped legacy/unused
    records (see list above), added the three missing PWA/dev records, then
    cut over nameservers at GoDaddy from the old pair to the new account's
    pair. Verified full record parity (especially MX/SPF/DMARC, so email kept
    working) before and after cutover.
  - Post-cutover testing surfaced a second, unrelated issue:
    `pwa.dev.neosleepcare.com` resolved but failed SSL — see the two-level
    subdomain / Universal SSL note above. Fixed by renaming to
    `pwa-dev.neosleepcare.com` (never-used domain, zero cost to rename) instead
    of paying for Advanced Certificate Manager.
  - Also found `FRONTEND_URL` on the Render API service was missing the new
    `pwa-dev` origin (CORS/session cookies would otherwise silently fail for
    dev logins) — added it alongside the existing `pwa` prod origin.
  - Old `lukasz512` Cloudflare account: intentionally left in place (not
    deleted) as a rollback path until the new setup proved stable. Safe to
    delete once confirmed solid.
