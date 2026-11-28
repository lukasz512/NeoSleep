# CORE-209 — Users screen grants Support its platform access

## Story
As Łukasz (platform admin), I set a user to role Support on the Users screen and they see
the work board and the Errors tab at their next sign-in, with no SQL in Supabase.

## Angles
- **User**: one save on the Users screen; the support person signs in again and has all five screens.
- **Tenant**: a tenant's own admin can still set role Support, but that opens only the tenant
  screens; Errors and the board show every client, so only platform staff can open them.
- **Patient / compliance**: removing the role, deactivating or deleting the user switches the
  platform row off in the same transaction, whoever does it. Owner/admin rows are never touched.
- **Platform**: existing Support users (Rosa, Tadeusz) get their row from migration 066.

## Acceptance criteria (each one a test, `routes/usersSupportPlatform.spec.ts`)
- platform admin creates a Support user → platform.users support row, `/admin/issues/access` true
- platform admin switches rep → Support → rep: row granted, then is_active false
- deactivating or deleting a Support user switches the row off
- tenant-only admin creates a Support user → tenant role saved, no platform row
- a platform owner/admin row is never downgraded or switched off
- migration 066 backfills active Support users without a platform row, idempotent
