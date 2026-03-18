# Planner and events

Planner module in rep-app provides a calendar view for scheduling meetings with doctors (HCPs). See **foundation/specs/SPEC-0043**.

## Event types

| Type   | In planner | Storage        | Description                          |
|--------|------------|----------------|--------------------------------------|
| **F2F**  | Yes        | tbl_events     | Face-to-face meeting (visit)         |
| **Video**| Yes        | tbl_events     | Video call (link stored)             |
| **Email**| No         | tbl_communication_log | Post-sale reporting only      |

## Tables

- **tbl_events** – planned meetings (F2F, video). Columns: rep_id, start_at, end_at, type, title, location, video_link, notes, region, status.
- **tbl_event_attendees** – multi-attendee support. Links event to HCP, Lead, or HCO.
- **tbl_communication_log** – email activity for reporting. Not shown in planner.

## API

- `GET /api/events?start=&end=&region=` – list events (filtered by rep/region)
- `GET /api/events/:id` – event detail with attendees
- `POST /api/events` – create event
- `PATCH /api/events/:id` – update event
- `DELETE /api/events/:id` – cancel (soft)

## Implementation

- **View toggle (Day / Week / Month):** VBtnToggle in the planner toolbar is styled as a segmented control: pill-shaped container with `--rep-bg-secondary` background; selected segment uses `--rep-bg`, `--rep-text`, and `--rep-primary` border (Vuetify variables as fallback). Matches the Hero Container Style toggle pattern used elsewhere.
- **Calendar:** Vuetify VCalendar (day/week/month views).
- **EventForm:** VDialog-based form (similar to LeadContactForm) with:
  - Title, start/end datetime, type (F2F/video), status (planned/done/rejected/no-show)
  - Multi-select HCO (accounts) and HCP (contacts)
  - Location (F2F), video link (video), notes, region
- **Adding events:** Click anywhere in a day cell (date label or empty area) in month/day/week view → form opens with that date prefilled (09:00–10:00). Or use Add button.
- **Editing:** Click event → form opens with event data.
- **Status mapping:** UI (planned, done, rejected, no-show) → API (scheduled, completed, cancelled, no_show).

## Visibility

- **Rep:** Own events only (rep_id = current user).
- **Manager:** Events in their region.
- **Admin:** All events.

## Future: PCF linkage

- `tbl_meetings` (SPEC-0015) will have optional `event_id` when meeting is started from planner.
- PCF links to meeting → event → meeting → PCF.
