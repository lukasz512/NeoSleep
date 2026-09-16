# ADR-020: Auth Token Model — Rotating Refresh Tokens, Zero Cookies

**Status**: Accepted | **Date**: 2026-09-16 | **Author**: Łukasz (Architect)

## Context

An `/audit` review found two P0 gaps in the current auth model, already affecting real patient data (PL/MX):

1. The bearer JWT (`apps/api/src/utils/jwt.ts`) lives in `localStorage` (`apps/pwa/src/composables/useApi.ts`) for its full 7-day (30-day with remember-me) lifetime — readable by any XSS on the page.
2. `POST /auth/logout` (`apps/api/src/auth.ts`) does not invalidate that token server-side. Only a password change does, via `incrementUserTokenVersion` — and that kills every device, not just the one being logged out.

The obvious first fix — move the token into an httpOnly cookie — is not available here. `apps/api/src/auth-token.spec.ts` already asserts **zero `Set-Cookie` on login** and that protected routes **ignore cookies entirely**, with a comment documenting why: `pwa.neosleepcare.com` (frontend) and the Render API (`onrender.com`) are different registrable domains, and a prior `SameSite=None` session cookie was silently dropped by Safari/iOS ITP — users could log in successfully and still see no session on iPhone, desktop unaffected. Bearer-JWT-in-localStorage was the fix for that incident, not an oversight — and it was thorough: migration 012 explicitly **dropped** the `remember_me_tokens` table and `platform.sessions` as part of that cutover, its own comment stating "nothing replaces this table — it's simply no longer needed" (confirmed with the user at the time). `remember_me_tokens` does not exist in any tenant schema today.

Separately, Łukasz's stated direction for this platform: a future native wrapper (Kotlin), targeting the Apple App Store and Google Play. RFC 8252 ("OAuth 2.0 for Native Apps") is the governing standard there, and it is explicit that native clients authenticate with bearer tokens delivered as JSON and held in platform secure storage (Keychain/Keystore) — not cookies, which native HTTP clients don't reliably carry the way a browser does. Designing the web PWA's auth contract to already look like this means the future native app is a storage-layer change, not a new backend.

Constraints from this decision: minimal new dependencies, robust/medical-grade, and — this is the point of the whole exercise — actually revocable.

## Decision

**Two-token model, zero cookies anywhere in the auth flow:**

- **Access token**: unchanged JWT (HS256, `JWT_SECRET`), shortened from 7d/30d to **15 minutes**. Still verified by `requireAuth` with no DB call (`apps/api/src/middleware/requireAuth.ts`'s existing "deliberately fast, works offline-first" design is preserved) — the short lifetime is what makes a stateless, unrevocable access token acceptable.
- **Refresh token**: a random opaque value (not a JWT — it is only ever looked up by hash, so there is nothing to decode), 7d/30d with remember-me, matching today's expiry. Hashed with the existing `hashToken()` (sha256, `apps/api/src/utils/hashToken.ts`) before storage — the same function already used for `password_reset_tokens`.
- **Storage**: recreate `remember_me_tokens` (migration 022) — the original shape from before migration 012 dropped it, since it maps onto exactly what rotation needs — plus one new column, `replaced_by_id UUID REFERENCES remember_me_tokens(id)`, for the rotation chain.
- **Rotation**: every `POST /auth/refresh` call reads the presented refresh token, verifies it's unexpired and unrevoked, mints a new access token **and** a new refresh token, sets `revoked_at` + `replaced_by_id` on the old row. The client always holds the newest refresh token only.
- **Reuse/theft detection**: if a refresh token with a non-null `revoked_at` is ever presented again, that is a signal the token was copied — every token in that chain (walk `replaced_by_id` both directions, or simpler: revoke every `remember_me_tokens` row for that `user_id`) is revoked immediately, forcing a real re-login everywhere.
- **Logout**: revokes only the presented refresh token's row (single device) — replaces today's non-functional no-op.
- **Password change/reset**: in addition to the existing `incrementUserTokenVersion` (unchanged, still the access-token-side kill switch), now also revokes every `remember_me_tokens` row for that user — preserves today's documented "password change signs out every device" behavior.
- **Transport**: both tokens travel as JSON body fields, never headers-only for refresh, never cookies. `Authorization: Bearer <access_token>` stays the access-token transport, unchanged.
- **Client storage**: access token in memory only (module-level variable, not persisted). Refresh token in `localStorage` on the web PWA today — same storage class as the current access token, but now the thing that can be stolen from it is only useful once before rotation-reuse detection catches it, unlike today's raw 7-30 day bearer token. A future native client stores the refresh token in Keychain/Keystore instead — no backend change required, the REST contract (`/auth/login`, `/auth/refresh`, `/auth/logout`) is identical.

**Explicitly rejected**: any cookie, even a narrowly-scoped one used only for `/auth/refresh` (the option considered and approved earlier this session before this table was found). It reopens the exact Safari/ITP failure mode `auth-token.spec.ts` exists to prevent, for a benefit (marginally harder to exfiltrate than localStorage) that rotation + reuse detection already delivers without the cross-site risk.

**Zero new backend dependencies** — `hashToken()`, `crypto.randomUUID()`/`crypto.randomBytes`, and the JWT signing infra all already exist and are reused as-is.

## Consequences

✅ Closes both audit findings: a stolen access token is useless after ≤15 minutes; logout actually revokes the session it belongs to; a stolen *refresh* token is caught and the whole chain killed the moment it's reused after rotation.
✅ Identical auth contract for web PWA and the future Kotlin/native app — RFC 8252-shaped from day one, so App Store/Play Store submission doesn't require redesigning auth, only relocating where the refresh token is persisted.
✅ `auth-token.spec.ts`'s zero-cookie invariant is not just preserved, it's reinforced — the Safari/iOS incident this ADR is downstream of cannot recur through this mechanism.
✅ Recreates `remember_me_tokens` with an actual, load-bearing purpose from day one — not resurrecting dead code, but reusing a shape that was already correct for this exact problem before it was dropped.
❌ Page reload now costs one `/auth/refresh` round-trip to re-establish the in-memory access token (previously: read from localStorage, free). Acceptable latency; a real-connectivity concern only offline, which the PWA already handles via its separate offline-read-cache path (ADR-013), not the login flow.
❌ Refresh token still sits in `localStorage` today, still JS-readable in principle — rotation + reuse detection is the mitigation, not elimination, of that exposure. Full elimination (WebCrypto non-extractable key binding, or moving to native secure storage) is future work once the native app exists; not proportionate to build for the web PWA alone today.

## Compliance Impact

| Standard | Impact |
|---|---|
| GDPR Art. 32 (security of processing) | Directly closes the finding: a stolen token no longer grants standing access to patient health data for up to 30 days after the fact. |
| GDPR Art. 5(1)(f) (integrity/confidentiality) | Logout now provably ends a session — auditable, testable claim for a DPA review. |
| ISO 27001 / SOC 2 (access control, session management) | Token lifetime, revocation, and theft-detection behavior are now all things that can be demonstrated to an auditor with a test suite, not asserted from reading code. |
| Future HIPAA (US expansion) | §164.312(a)(2)(iii) (automatic logoff) and (d) (person/entity authentication) are both strengthened by short-lived access tokens and real revocation. |
