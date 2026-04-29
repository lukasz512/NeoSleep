# API Contract (BFF) – v1 draft

Base: `/api`

## Auth
- `GET /api/health` – health check
- `GET /api/auth/session` – current session
- `POST /api/auth/logout`

## Tenant config
- `GET /api/tenant/config` – resolved tenant-config (cached, versioned)

## App config (theme / branding)
- `GET /api/config/app` – app-wide theme and branding (primary_color, secondary_color, border_radius, logo_url). Shared by website and rep-app. Source: `app_config`. See foundation/docs/BRAND_AND_APP_CONFIG.md.

## CRM data (Notion-backed v1)
- `GET /api/leads?query=&region=` – list
- `GET /api/leads/:id` – details
- `GET /api/hcp?query=` – list
- `GET /api/hcp/:id` – details
- `GET /api/hco?query=` – list
- `GET /api/hco/:id` – details

## Meetings / PCF
- `POST /api/meetings` – start meeting
- `PATCH /api/meetings/:id/stop` – stop meeting
- `POST /api/pcf-submissions` – submit PCF (online) / accept queued sync

## Content
- `GET /api/content` – list presentations
- `GET /api/content/:id` – metadata
- `GET /api/content/:id/file` – pdf (cacheable)

## Planner events (calendar)
- `GET /api/events?start=&end=&region=` – list events (filtered by rep/region)
- `GET /api/events/:id` – event detail with attendees
- `POST /api/events` – create event (title, start_at, end_at, type, status, location, video_link, notes, region, attendees)
- `PATCH /api/events/:id` – update event

## Events / analytics
- `POST /api/events` – batch events (slide tracking, ui events) – *note: conflicts with planner; consider `/api/analytics/events`*

## AI
- `POST /api/ai/rep-copilot` – Q&A
- `POST /api/ai/pcf-draft` – draft PCF fields from transcript/context

Notes:
- RBAC/region enforced on every endpoint.
- Event payloads are redacted; never store secrets or raw PHI in logs.
