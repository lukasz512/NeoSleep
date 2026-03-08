# Users and roles

**Three roles:** `admin`, `manager`, `rep`. Stored in `tbl_users` (migration 004). Session includes `user.role` so the frontend and BFF can enforce permissions.

## Table: tbl_users

- **id** (UUID), **email**, **name**, **role** (`admin` | `manager` | `rep`), **provider**, **provider_id**, **region**, **created_at**, **updated_at**.
- New users (e.g. first Google login) get **role = rep** by default. Change role in Directus or via a future admin endpoint.
- Unique on `(provider, provider_id)` so one row per Google (or other) identity.

## Auth flow

- User signs in with Google → BFF callback calls **getOrCreateUserByProvider** → session gets `user.id` (our UUID), `user.email`, `user.name`, **user.role** from `tbl_users`.
- **GET /auth/session** returns `{ user: { id, email, name, picture?, role } }`. Frontend can use `user.role` for UI (e.g. show admin-only links).

## Permissions (next steps)

- **BFF:** Add middleware or per-route checks that require a role (e.g. `requireRole('admin')` for future admin-only endpoints). For now, all API routes that use session can read `req.session.user?.role`.
- **Frontend:** Use `auth.user?.role` to show/hide sections or routes (e.g. manager and admin see extra reports; rep sees own data only). Data-level filtering (e.g. rep only sees their region) will use `tbl_users.region` and BFF logic when we add it.
- **Directus:** Import `tbl_users` so you can edit roles (and later region) without code changes.

## Code references

- **Migration:** `services/bff/migrations/004_users.sql`
- **BFF:** `services/bff/src/db.ts` (`getOrCreateUserByProvider`, `getUserById`), `services/bff/src/auth.ts` (Google callback writes session with role)
- **Rep-app:** `apps/rep-app/src/stores/auth.ts` (`AuthUser.role`, `UserRole` type)

## Summary

- **3 roles:** admin, manager, rep. One table `tbl_users`; role in session; permissions = BFF + optional UI visibility by role.
