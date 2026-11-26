## Refined User Story: Sign in with Google button (NEO-78)

**Classification**: feature (new sign-in path, changes who can get into the app, has a security angle)
**Raw input**: Add a "Sign in with Google" button to the login screen. Backend OAuth flow exists (`GET /api/v1/auth/google`, callback, `POST /auth/google/exchange`), Cloud Run dev/prod are configured, but nobody can start the flow because there is no button. Only existing users whose email matches may sign in; show a clear localized message for an unknown email; hide the button where Google login is not configured.

### As a rep / manager / admin who already has an account, I want to sign in with my Google account so that I don't need to remember a separate password.

### Stakeholder Notes
- 👤 User: Field staff mostly log in on a phone; a one-tap Google sign-in removes the password step and the "forgot password" detour. Today the only workaround is email + password.
- 🏢 Client: The tenant (pharma company) keeps control over who has access: accounts are still created only by an admin, Google is just another way to prove who you are. Many tenants run Google Workspace, so this lowers onboarding friction.
- 🩺 Patient: No downstream patient effect, as long as access stays limited to accounts an admin created (which is exactly what this ticket enforces).
- 🚀 NeoCRM/Platform: Generic for every white-label tenant; the button only shows when the environment has Google OAuth credentials, so tenants/environments without them are unaffected.
- ⚖️ Compliance: Important finding: the existing callback **auto-created a new `rep` account with global scope for any Google email**. That means anyone with a Google account could have entered the CRM (health-adjacent personal data) as soon as a button existed. This story removes that. Linking a Google identity to an existing account by email must only trust Google-verified emails (`email_verified`). No new personal data is stored beyond the Google `sub` id on an existing user row.

### Medical-Industry Trend Check
- n/a — internal authentication change, not a PCF / HCP-engagement / rep-workflow feature.

### Acceptance Criteria
- [ ] The login screen shows a "Sign in with Google" button (localized EN/PL/MX) below the password form, separated by an "or" divider, only when `GET /api/v1/auth/providers` returns `{ google: true }`.
- [ ] `GET /api/v1/auth/providers` is public and returns `google: true` only when both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set; otherwise `false`. If the request fails, the button stays hidden.
- [ ] The button follows Google's branding guidelines: official four-colour "G" mark, Google's wording, light theme = white button with `#747775` border and `#1F1F1F` text, dark theme = `#131314` button with `#8E918F` border and `#E3E3E3` text, Roboto-style medium weight, same height/width as the primary sign-in button.
- [ ] Clicking it navigates the browser to `<API>/api/v1/auth/google?origin=<current frontend origin>`; the API only honours an `origin` that is in its `FRONTEND_URL` allowlist.
- [ ] Google account whose email matches an existing, active, non-deleted user: signs in and lands on the dashboard; the user's `google_sub` is linked on first sign-in.
- [ ] Google account with no matching user: **no account is created**; the browser returns to `/login?error=google_no_account` and a toast says "This Google account doesn't have access. Ask your administrator for an invitation." (EN/PL/MX).
- [ ] Matching user that is inactive/suspended: refused, `/login?error=google_account_inactive`, localized message.
- [ ] Google email not verified: refused as "no account" (never linked by email).
- [ ] Existing user already linked to a *different* Google account: refused, not re-linked.
- [ ] Any other callback failure (`auth_failed`, `token_exchange`, …): a generic localized "Google sign-in failed" toast.
- [ ] `POST /auth/google/exchange` also refuses a user that became inactive in the 60 s between callback and exchange.
- [ ] API integration tests against a real Postgres cover: known user, unknown email (no row created), inactive user, unverified email, already-linked-to-other-sub, providers endpoint on/off. UI unit tests cover: button hidden/visible, correct redirect URL, error query → toast.

### Open Questions
- none (product decisions made by Łukasz: refuse unknown emails, admins create accounts, hide when unconfigured).

### Hand-off
→ `/dev feat google-sign-in-button` — scope is clear and self-contained; no schema change (`users.google_sub` already exists).
