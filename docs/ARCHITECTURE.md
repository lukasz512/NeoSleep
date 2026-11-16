# Architecture

Only the parts no other doc covers yet. Hosting is in `INFRASTRUCTURE.md` and the decisions are in the `ADR-*.md` files. The schema itself is in `apps/api/migrations/`.

## Table → writer

Some tables in the schema have no writer yet. We keep them on purpose, because the schema is sized for the full app. When a live data source exists, it writes into the table that already has a place for it. Each fact has one home. These are the rows wired in CORE-213:

| Table | Writer | When | Notes |
|---|---|---|---|
| `{tenant}.webhook_event` | `commands/emailDelivery.ts` (`POST /webhooks/resend`) | Every verified Resend event, before it is applied | Key `(source, external_id)` = (`resend`, `svix-id`). A retry of a processed or skipped delivery answers `duplicate` and changes nothing. A failed apply stays `failed` with `last_error`, and Resend's retry re-applies it. An event with no known tenant tag is stored in the default tenant as `skipped`. |
| `platform.audit` | `db/problemReport.ts` `setDiagnosticStatus` (`PATCH /admin/diagnostics/:id`) | An error ticket moves open / resolved / dismissed | `diagnostic.status`, before → after, in the same transaction as the change. |
| `platform.audit` | `db/workBoard.ts` `insertSessionToken` / `revokeSessionToken` (`/platform/work/session-tokens`) | A board session token is issued or revoked | `board.session_token.issue` / `.revoke`. It stores the token name, never the token or its hash. |
| `{tenant}.kpi_snapshot` | `commands/kpiSnapshot.ts` (`POST /kpi/jobs/snapshot`, `.github/workflows/kpi-snapshot.yml`) | Nightly, 00:30 UTC, for the UTC day that just ended | `period_type = day`. Tenant scope: `patients_created`, `encounters`, `pcfs_submitted`, `device_orders_sent`, `purchase_orders`, all written even at 0. User and territory scope: `encounters`, `pcfs_submitted`, written only when above 0. A rerun replaces the day. Backfill a past day with `{ "day": "YYYY-MM-DD" }`. |
| `{tenant}.user_session` | not yet: lands with CORE-207 (login audit) | Sign-in / refresh | |

Platform-admin actions that already keep their own history stay where they are, so nothing is recorded twice:

- Work items → `platform.work_item_event`
- Document content → `platform.document_content_version`
- Tenant business data → `{tenant}.audit_log`

There are no platform endpoints yet for tenant, platform-user or feature-flag admin. When one is built, it writes to `platform.audit` through `insertPlatformAudit` in the same transaction as the change.
