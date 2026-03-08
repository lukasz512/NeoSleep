# Automation, data flow, and compliance

Minimal automation, optional Notion, and compliance-friendly handling of leads/HCP/HCO. Keeps complexity and dependency on Make.com low.

## Goal: simple and low-maintenance

- Prefer **fewer dependencies** on Make.com; if something can be done in BFF + DB or with Notion, that’s acceptable.
- **Notion** is already in use; it can stay as source of truth for a while (e.g. leads/HCP/HCO) or as a mirror. Data can live in Excel → import to Notion or directly to DB.
- **Compliance and security**: treat contact and health-related data with care; support data minimization and deletion where required (e.g. inactive leads, consent withdrawal).

## Data flow: Leads → HCP/HCO

- **Leads**: initial table (from Excel import or Notion). When contact is made and qualified → record becomes **HCP** and/or **HCO**.
- **Inactive leads**: when no contact is made or after policy, mark inactive. **Compliance**: you may need to remove or anonymize phone/email (and other PII) for inactive or withdrawn contacts. Design fields so that “soft delete” or “anonymize” is possible (e.g. clear phone/email, set status = inactive, keep only minimal audit info).
- **HCP / HCO**: canonical entities; link to leads for history. BFF (and later DB) enforce who can see what (region, role).

## Where to keep data (simple path)

| Option | Pros | Cons |
|--------|------|------|
| **Notion only (for now)** | Already there, no new DB to run. BFF talks to Notion API; Excel → manual/csv import to Notion. | Rate limits, less control, harder to enforce strict compliance (anonymization, retention). |
| **Postgres (local then hosted)** | Full control, audit, retention, anonymization. One source of truth. | You need to run and later host Postgres. |
| **Notion + Postgres** | Notion for ops/visibility; Postgres for app and compliance (BFF reads/writes Postgres; optional sync from Notion or Excel). | Two sources; sync logic to maintain. |

**Recommendation:** Start with **local Postgres** (see DATA_AND_API.md and LOCAL_DATABASE.md). Import from Excel (or Notion) into Postgres via a one-off script or BFF admin endpoint. Use Notion only if you really need it for day-to-day ops; otherwise keep automation and integrations minimal.

## Make.com – minimal use

- Use Make only where it clearly saves time (e.g. i18n auto-translate PRs, scheduled webhooks).
- Prefer **BFF webhooks** that Make calls (e.g. “sync leads from external source”, “trigger report”). BFF then writes to Postgres (or Notion adapter if you keep it).
- No need to host DB or app logic inside Make; keep logic in BFF + DB.

## Compliance and security (high level)

- **Data minimization**: store only what’s needed; avoid keeping full PII for inactive/withdrawn contacts.
- **Anonymization / deletion**: support clearing or hashing phone, email, and other identifiers for leads/HCP when required by policy or consent withdrawal. Keep only what’s needed for audit (e.g. “contact anonymized on date X”).
- **Access control**: BFF enforces roles (admin, manager, rep) and region; frontend never sees data the user isn’t allowed to access.
- **Audit**: log who did what (see OBSERVABILITY_AND_LOGGING.md) so you can demonstrate compliance and investigate issues.

## Users and roles

- **Auth**: use an external provider (e.g. Google OIDC per SPEC-0002). BFF validates tokens and maps identity to **your** user/role store.
- **Your DB** (Postgres): store **users** (id, email or provider id, role: admin | manager | rep, region, etc.). No passwords if you rely on Google; only mapping from provider identity to your user row.
- Roles: **admin** (full), **manager** (e.g. team/region), **rep** (own data / assigned leads). BFF checks role and region on every request.

## Summary

- Leads → HCP/HCO flow; inactive + compliance-friendly anonymization/removal of contact data.
- Prefer **local then hosted Postgres**; optional Notion or Excel import; **minimal Make.com** (webhooks into BFF).
- Users and roles in your DB; auth delegated to provider (e.g. Google), BFF enforces access.
