# Auth and test users (orientation)

Short reference for when you implement real login and need to test permissions. See SPEC-0002 (Google Workspace OIDC) for the target solution.

## Rep-app auth flow (blueprint)

The rep-app is the reference blueprint for “app starts at login” and router-based session checks. Other apps (admin, portal) can reuse this pattern.

- **Entry**: Root path `/` redirects to `/login`. Unauthenticated users always see the login page first.
- **Router guard** (`router/beforeEach`):
  - **Public routes** (e.g. `/login` with `meta.public`): If user is already authenticated, redirect to `query.redirect` or `/dashboard`.
  - **Protected routes** (`meta.requiresAuth`): In production, call BFF `GET /auth/session` (via auth store `fetchSession()`) if not yet checked this page load; if session is invalid, redirect to `/login?redirect=<intended path>`. In dev, no BFF call; only the Pinia `isAuthenticated` flag is used (so “Login as” + “Go to app” works without BFF).
  - **Dev-only routes** (`meta.devOnly`): In production redirect to `/login`; in dev allow access.
- **Auth store** (Pinia): `fetchSession()` calls BFF with credentials, sets `isAuthenticated` and `user`; `sessionChecked` avoids repeated calls. After Google OAuth callback, the login page runs `fetchSession()` and then redirects to `query.redirect` or `/dashboard`.
- **BFF URL**: Shared via `getBffUrl()` (from `constants`); configurable with `VITE_BFF_URL` in env.

This gives a single place for session validation (router + store), clear entry at login, and redirect-back-after-login for deep links.

## Goal

- **Production**: Reps sign in with Google (Workspace or allowed domains). BFF validates OIDC token and enforces RBAC.
- **Testing**: You need 2–3 identities to test different roles (e.g. rep, admin, viewer) without paying for many Workspace seats.

## Options for test users

| Option | Notes |
|--------|--------|
| **Personal Gmail accounts** | Free. With Google OAuth you can allow multiple Gmail addresses in dev/staging (e.g. via allowlist in env). Each account = one test user. Good for 2–3 test users. |
| **Google Workspace** | Paid; gives you many users and domain control. Use when you need real company emails and strict domain allowlist. |
| **Dev-only “Login as” (current)** | Rep-app login page has a dev-only dropdown “Login as (dev only)” with Rep / Admin / Viewer. No real auth; just navigates to app. Use to build UI and flows; later replace with real OIDC and read role from token/session. |

## Suggested path

1. **Now**: Use the sample login page and dev “Login as” to build views and permission-aware UI. Store selected dev user in localStorage or a small store so header/sidebar can show different name/role (optional next step).
2. **SPEC-0002**: Implement Google OIDC in BFF. In **dev/staging** allow a few Gmail addresses (env allowlist) so you can sign in with 2–3 personal Gmails and assign them roles in your DB or config.
3. **Production**: Restrict to your Workspace domain(s); roles from BFF/session/DB.

## Multiple users with Gmail (free)

Yes. Google OAuth does not limit how many different accounts log in to your app. You can have 2, 3, or more test users; each uses their own Gmail. You only need to:

- Register your app in Google Cloud Console (OAuth consent screen, credentials).
- In dev, allowlist those Gmail addresses in BFF (or in tenant config) and map them to roles (rep, admin, viewer) for testing.

No need for a paid Workspace to test with multiple people; Workspace is for production domain control and company emails.
