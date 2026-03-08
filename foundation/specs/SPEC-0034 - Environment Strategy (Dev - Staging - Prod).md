# SPEC-0034: Environment Strategy (Dev / Staging / Prod)

Status: Draft  
Owner: Neo Sleep Care  
Milestone: MVP  
Apps/Modules: repo, bff, rep

## 1) Goal
Create a clean separation between **dev**, **staging**, and **prod** so we can iterate safely, test with real-like data, and avoid leaking secrets.

## 2) User story
As a maintainer, I want isolated environments with separate credentials and datasets, so changes can be tested safely before production.

## 3) Approach
- Environments: `dev`, `staging`, `prod`
- Separate OAuth clients/redirect URIs per env
- Separate Notion DBs per env (or at least separate pages/databases)
- Separate email sending modes:
  - dev: sandbox / log-only
  - staging: allowlist recipients
  - prod: full send
- Separate tenant config versions per env

## 4) Repo & config
- `.env.example` files:
  - `.env.dev.example`
  - `.env.staging.example`
  - `.env.prod.example`
- Never commit real `.env` values
- CI uses environment secrets:
  - `GOOGLE_OIDC_CLIENT_ID_*`
  - `NOTION_TOKEN_*`
  - `EMAIL_PROVIDER_KEY_*`
  - `SENTRY_DSN_*`
- BFF validates required env vars on boot.

## 5) Deploy strategy
- One deploy per app per env:
  - Rep app (PWA) → dev/staging/prod URLs
  - BFF → dev/staging/prod URLs
- DNS/Subdomains suggestion:
  - dev: `dev.app.neosleepcare.com`, `dev.api.neosleepcare.com`
  - staging: `staging.app...`, `staging.api...`
  - prod: `app...`, `api...`

## 6) Edge cases
- Staging accidentally pointing to prod Notion
- Mixed OAuth redirect URIs
- Email provider sending from staging to real users

## 7) Acceptance criteria
- Each env has distinct credentials and data sources
- Staging can be deployed and tested end-to-end
- No prod secrets in dev
- BFF refuses to start if env is misconfigured
- Email sending is safe (sandbox/allowlist)

## 8) Test plan
- Unit: env validation rejects missing vars
- Integration: “staging” build points to staging API
- E2E: login flow works on staging with staging OAuth client

## 9) Documentation updates
- Add env section to `foundation/docs/ARCHITECTURE_BIBLE.md`
- Add runbooks for staging deploy and safe email testing

Date: 2026-02-18
