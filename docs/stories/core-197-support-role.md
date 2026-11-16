# CORE-197 — NeoCRM support role

## Story
As a NeoCRM employee helping a tenant, I sign in to the PWA and see Calendar, Resources,
Documents, Reports (with the Errors tab) and the work board, so I can handle reports and
content without access to patients, HCPs, leads, users or territories.

## Angles
- **User**: one login, five screens, home = Calendar. The role label reads "NeoCRM Support" /
  "Wsparcie NeoCRM" / "Soporte NeoCRM".
- **Tenant**: an admin can grant `support` from the Users screen like any other role.
- **Patient / compliance**: deny-by-default. `middleware/supportAllowlist.ts` answers 403 for
  every API path outside the allowlist, so routes guarded only by `requireAuth` (patient,
  HCP and lead reads) never serve a support user. The calendar shows only the user's own items.
- **Platform**: Errors and the work board are cross-tenant, so they also need an active
  `platform.users` row with role `support` (or `owner`/`admin`). A tenant admin granting the
  tenant role alone can't open them. Support staff can be assigned work board items.

## Acceptance criteria (each one a test)
- `support` nav = /calendar, /resources, /documents, /issues, /platform/board
  (`AppLayout.spec.ts`, `useVisibleNavRoutes.spec.ts`)
- with a platform.users row, the API opens calendar, documents, reports, errors and the board;
  patients, HCPs, HCOs, leads, users, territories, appointments, encounters, device orders,
  sleep studies and treatment plans answer 403 (`supportAllowlist.spec.ts`)
- without a platform.users row, errors and the board answer 403
- migration 065 adds `support` to `user_roles_role_check` in every tenant and in
  `create_tenant_schema()` (CI parity check)

## Creating the account (by hand)
1. PWA → Users → New user, role **Support**, scope = the country it should see.
2. Supabase SQL (platform-wide, once per person):
   `INSERT INTO platform.users (email, name, role) VALUES ('<email>', '<name>', 'support');`
