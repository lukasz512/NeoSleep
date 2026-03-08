# Console logs to DB and self-healing automation

**Goal:** On production, persist console-style logs (from BFF and optionally frontend) into the database. Use them to detect **recurrent** issues (e.g. same error once a week or month) and automatically create **fix tasks**. Optionally have the system propose an improvement plan so the app can “think” and suggest what to fix.

## 1. Where logs go

- **Table:** `tbl_console_errors` (see migration `003_console_logs_and_fix_tasks.sql`).
- **Sources:**
  - **BFF:** In production (or when `ENABLE_CONSOLE_LOG_DB=1`), BFF can write its own `console.log` / `console.error` output to `tbl_console_errors` (e.g. via a small logger that also writes to DB).
  - **Frontend:** In production, the rep-app (and later portal) can send log/error payloads to a BFF endpoint (e.g. `POST /api/logs`) that writes to `tbl_console_errors`. This replaces or complements “remote console” with a controlled, auditable store.
- **What to store:** level, message, optional stack, source (bff | frontend), environment, optional user/session/request id, optional metadata (redact PII). A **message hash** (or fingerprint) is stored so we can group identical messages for recurrence detection.

No need to log every `console.log` from the frontend; focus on **warn** and **error**, and optionally **info** for important events. BFF can log all server-side errors and important requests.

## 2. Recurrence detection

- **Definition of “recurrent”:** The same logical issue appears multiple times in a time window. “Same” is identified by a **fingerprint**: e.g. hash of normalized message (and optionally first line of stack).
- **Windows:** e.g. “at least N times in the last 7 days” or “at least M times in the last 30 days”. Thresholds can be configurable (env or Directus config).
- **Job:** A scheduled job (cron on the server, or Directus Flow on a schedule, or a small Node script run by cron) periodically:
  1. Reads from `tbl_console_errors` (e.g. last 7 and last 30 days).
  2. Groups by fingerprint (message_hash).
  3. If a group has count ≥ threshold (e.g. 3 in 7 days, or 5 in 30 days), it **creates or updates** a row in `tbl_fix_tasks` (see below).

So recurrent logs automatically produce “fix tasks” that you (or later an AI step) can work on.

## 3. Fix tasks

- **Table:** `tbl_fix_tasks`. Fields: id, created_at, status (open | in_progress | done | dismissed), title, description, log_fingerprint (or link to representative log id), recurrence_count, recurrence_window (e.g. `7d` or `30d`), optional suggested_plan, resolved_at, etc.
- **Creation:** The recurrence job creates a task when it detects a new recurrent pattern; or it updates an existing open task (e.g. bump recurrence_count and updated_at) if the same fingerprint is still recurring.
- **Visibility:** You can manage these tasks in **Directus** (import `tbl_fix_tasks` as a collection) or in a simple admin view. Directus Flows could also consume “new fix task” and e.g. send a notification or create a ticket elsewhere.

## 4. Self-healing / improvement plan (optional)

- **Idea:** For each fix task (or for recurrent logs that don’t yet have a task), the system can “think” and propose a plan: what might be wrong and what to change (code, config, or process).
- **Options:**
  - **Rule-based:** Template messages per fingerprint (e.g. “Network timeout” → “Check BFF timeout and retry logic”). Stored in DB or config.
  - **LLM-based:** Periodically (e.g. nightly or when a new fix task is created), send the last few log samples (message + stack, redacted) to an LLM API and ask for a short “suggested fix plan”. Store the result in `tbl_fix_tasks.suggested_plan`. You review and approve; the app does not apply code changes by itself.
- **Automation:** A Directus Flow or cron-triggered script can:
  1. Find open fix tasks with no `suggested_plan` (or outdated).
  2. Fetch recent logs for that task’s fingerprint.
  3. Call your LLM endpoint (or a simple prompt runner), get a plan, write it to `suggested_plan`.
- **Safety:** Only **propose** plans; no automatic code changes or deploys. You decide what to fix and how.

## 5. End-to-end flow (summary)

1. **Prod:** BFF and/or frontend send logs → BFF writes to `tbl_console_errors`.
2. **Scheduled job:** Every X hours (e.g. daily), run recurrence detection on `tbl_console_errors` → create/update `tbl_fix_tasks`.
3. **Optional:** For new or updated fix tasks, run “plan suggester” (rules or LLM) → fill `suggested_plan`.
4. **You:** Review tasks in Directus (or admin UI), assign, fix, mark done or dismissed. Over time the app “surfaces” what to fix and suggests how; you stay in control.

## 6. Implementation checklist

- [x] Design doc (this file).
- [x] Migration `003_console_logs_and_fix_tasks.sql`: `tbl_console_errors`, `tbl_fix_tasks`.
- [x] BFF: `POST /api/logs` (body: level, message, stack?, source?) → insert into `tbl_console_errors` (only when `ENABLE_CONSOLE_LOG_DB=1` or `NODE_ENV=production`).
- [ ] BFF: Optional logger that, in prod, also writes to `tbl_console_errors` for server-side logs.
- [ ] Frontend: In production build, override or hook `console.error` / `console.warn` and send to `POST /api/logs` (batched or on critical only).
- [ ] Recurrence job: Script or Directus Flow that runs on schedule, groups by message_hash, inserts/updates `tbl_fix_tasks`.
- [ ] Directus: Import `tbl_console_errors` and `tbl_fix_tasks` so you can browse and manage tasks.
- [ ] Optional: Plan suggester (rules or LLM) writing to `tbl_fix_tasks.suggested_plan`.

## 7. Relation to other docs

- **OBSERVABILITY_AND_LOGGING.md:** Describes the current implementation (BFF error middleware, rep-app bffFetch, POST /api/logs, ENABLE_CONSOLE_LOG_DB in dev). Covers Sentry, audit log, and “errors → task for AI fixes”. This doc is the **concrete** implementation: logs in our DB, recurrence, fix tasks, and optional suggested plans. Sentry can remain for real-time alerting; `tbl_console_errors` is our own, queryable history for recurrence and self-healing.
- **AUTOMATION_AND_COMPLIANCE.md:** Prefer BFF + DB for automation; minimal external services. The recurrence job and plan suggester can run on the same server (cron + Node script) or via Directus Flows.
