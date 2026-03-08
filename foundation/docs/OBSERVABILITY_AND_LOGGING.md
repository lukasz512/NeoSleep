# Observability, logging, and error handling

What to log, how to detect errors, and how to use that for support and (optionally) AI-driven fixes. No remote console in production; focus on safe, scalable observability.

## Current implementation (BFF + rep-app)

- **BFF:** Global error middleware catches all route errors, logs to console and (when `ENABLE_CONSOLE_LOG_DB=1` or production) writes to **tbl_console_errors**. Async route handlers are wrapped with `asyncHandler()` so thrown errors reach the middleware. Response: `500` + `{ error: "Internal server error" }`.
- **Rep-app:** All BFF calls go through **bffFetch** (`composables/useBffApi.ts`): same as `fetch` with credentials; on non-ok response it shows a notification and sends the error to **POST /api/logs** (message, path, status), which persists to **tbl_console_errors** when logging to DB is enabled.
- **Error notification display (do not change):** When the BFF returns JSON like `{"error":"..."}` or `{"message":"..."}`, the notification shows **only** the extracted string (e.g. `"Database not available. Ensure Postgres is running and DATABASE_URL is set."`). Never show raw JSON in the notification. The `useBffApi` composable parses the response body and extracts `error` or `message`; if the result still looks like JSON, it parses again (handles double-encoding). This rule prevents user-facing noise and must not be reverted.
- **Dev:** Set **ENABLE_CONSOLE_LOG_DB=1** in `services/bff/.env` to persist BFF and frontend API errors to the database; inspect them in Directus (**tbl_console_errors**). See [CONSOLE_LOGS_AND_SELF_HEALING.md](CONSOLE_LOGS_AND_SELF_HEALING.md).

## Principles

- **No remote access to user browsers** in production (security and privacy). Use logs, session context, and (optionally) replay instead.
- **Structured logs** in BFF; **frontend errors** reported to a single place (e.g. Sentry) with user/session context.
- **Audit trail**: who did what, when (for compliance and debugging).
- **Optional**: feed errors + context into tasks for AI to suggest or apply fixes (you stay in control and provide use cases).

## 1. Audit log (user actions)

- **Where**: BFF or DB. Table or append-only store: `user_id`, `action`, `resource`, `timestamp`, optional `details` (redacted, no sensitive PII).
- **What**: e.g. “user X viewed lead Y”, “user X updated HCP Z”, “user X exported list”. Enough to answer “what did this user do?” and “who changed this record?”.
- **Compliance**: retain according to policy; allow export for audits.

## 2. Frontend error reporting (Sentry or similar)

- **Global error handler** in each app (Vue `errorCaptured` / global handler): send errors to Sentry (or similar) with:
  - Stack trace, message, component.
  - **User context**: user id (no email if sensitive), role, app (rep/admin/portal).
  - **Session/request**: request id or session id so you can correlate with BFF logs.
  - **Last N actions** (e.g. last 5 route changes or important clicks) from a small in-memory buffer – no passwords, no full payloads.
- **Location**: you can send coarse location (e.g. country/region from IP on the server, or from a consent-based frontend call). Prefer server-side so you control what’s stored and stay compliant.

This gives you “what was the user doing when the app broke?” without attaching to their console.

## 3. Session replay (optional)

- Tools like **LogRocket** or **FullStory** record a replay of the session when an error occurs (or on sampling). Use only if you have consent and a clear privacy policy; can be restricted to UAT or to error-only replays.
- Alternative: **no replay**, rely on “last actions” + stack + BFF logs. Simpler and fewer compliance concerns.

## 4. BFF and backend logs

- **Structured logs** (JSON): request id, user id, path, status, duration. No sensitive data in logs (redact PII).
- **Errors**: log stack and context; send to Sentry (or similar) from BFF so backend and frontend errors live in one place.

## 5. From errors to AI-assisted fixes (optional)

- **Sentry** (or similar) can trigger webhooks on new issues.
- **Flow**: Error occurs → Sentry groups it → webhook fires → your backend or automation creates a **task** (e.g. in a queue or Notion) with: error message, stack, last user actions, environment (prod/UAT), link to Sentry.
- **You** define use cases and acceptance criteria; **AI** (or a script) can suggest code changes or patches. You review and approve. No need to “connect to user console”; the task contains enough context.

## 6. Global error handling in the app

- **Vue**: `app.config.errorHandler` + optional `errorCaptured`; report to Sentry and optionally show a simple “Something went wrong” + notification.
- **API calls**: Use **bffFetch** (rep-app `useBffApi`) for all BFF requests. It intercepts non-ok responses, shows a notification, and sends errors to POST /api/logs so they appear in tbl_console_errors. Optional: add Sentry for 4xx/5xx as well; show user-friendly message and optionally retry or redirect to login.

## Summary

- **Audit log** in BFF/DB for “who did what”.
- **Sentry** (or similar) for frontend and BFF errors, with user/session and last actions – **no** remote console.
- **Optional** session replay with consent; otherwise last-actions buffer is enough.
- **Optional** Sentry webhook → task for AI-assisted fixes; you own use cases and approval.

**See also:** [CONSOLE_LOGS_AND_SELF_HEALING.md](CONSOLE_LOGS_AND_SELF_HEALING.md) – prod console logs persisted to DB (`tbl_console_errors`), recurrence detection, and automatic fix tasks with optional improvement plans.
