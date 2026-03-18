# SPEC-0043: Planner – Calendar view and events

Status: Draft  
Owner: Neo Sleep Care  
Apps/Modules: rep-app, bff  
Milestone: MVP

## 1) Goal

Provide a native/Google-like calendar view in the Planner module for reps to schedule meetings with doctors (HCPs). Support F2F and video meetings, multi-attendee events, and prepare for PCF (post-call form) linkage. Email outreach is tracked separately (post-sale reporting) and is not visible in the planner.

## 2) User story

As a rep, I want to plan meetings with doctors in a calendar view, so I can schedule F2F visits and video calls, invite multiple HCPs to one event, and later add post-call notes.

## 3) Event types

| Type   | In planner | Description                                      |
|--------|------------|--------------------------------------------------|
| **F2F**  | Yes        | Face-to-face meeting (visit at HCO, clinic, etc.) |
| **Video**| Yes        | Video call (link stored)                         |
| **Email**| No         | Email sent – for post-sale reporting only. Stored in `tbl_communication_log`, not in planner. |

## 4) UX flow

- **Planner view:** Calendar (month/week/day) with events. Native/Google-like look.
- **Create event:** Click date/time → modal/form: type (F2F/Video), title, start/end, location (F2F) or video link, attendees (multi-select HCP/Lead).
- **Edit event:** Click event → same form.
- **Event detail:** Shows attendees, type, location/link. Later: link to PCF when meeting is completed.
- **Visibility:** Rep sees only events in their region (or own events); manager sees region; admin sees all.

## 5) Data model

### tbl_events

| Column      | Type        | Description                                      |
|-------------|-------------|--------------------------------------------------|
| id          | UUID        | PK                                               |
| created_at  | TIMESTAMPTZ |                                                  |
| updated_at  | TIMESTAMPTZ |                                                  |
| rep_id      | UUID        | FK tbl_users – owner                             |
| start_at    | TIMESTAMPTZ |                                                  |
| end_at      | TIMESTAMPTZ |                                                  |
| type        | TEXT        | `f2f` \| `video`                                |
| title       | TEXT        | Optional                                         |
| location    | TEXT        | For F2F – address or place name                 |
| video_link  | TEXT        | For video – URL                                  |
| notes       | TEXT        |                                                  |
| region      | TEXT        | For rep/manager filtering                       |
| status      | TEXT        | `scheduled` \| `completed` \| `cancelled` \| `no_show` |

### tbl_event_attendees

| Column       | Type  | Description                                      |
|--------------|-------|--------------------------------------------------|
| id           | UUID  | PK                                               |
| event_id     | UUID  | FK tbl_events                                    |
| attendee_type| TEXT  | `hcp` \| `lead` \| `hco`                        |
| attendee_id  | UUID  | FK to tbl_hcp, tbl_leads, or tbl_hco            |
| is_primary   | BOOL  | Primary contact for the event                    |

Multiple rows per event = multi-attendee meeting.

### tbl_communication_log (email – not in planner)

| Column      | Type        | Description                                      |
|-------------|-------------|--------------------------------------------------|
| id          | UUID        | PK                                               |
| created_at  | TIMESTAMPTZ |                                                  |
| rep_id      | UUID        | FK tbl_users                                     |
| contact_type| TEXT        | `hcp` \| `lead` \| `hco`                        |
| contact_id  | UUID        | FK to tbl_hcp, tbl_leads, or tbl_hco            |
| type        | TEXT        | `email` (extensible)                             |
| sent_at     | TIMESTAMPTZ |                                                  |
| subject     | TEXT        | Optional                                         |
| notes       | TEXT        |                                                  |

Used for post-sale reporting (e.g. “email sent”). Not shown in planner.

### Future: PCF linkage

- `tbl_meetings` (SPEC-0015) will have optional `event_id` – when a meeting is started from a planner event.
- PCF submissions link to meetings, so event → meeting → PCF.

## 6) API (BFF)

| Method | Endpoint                    | Description                                      |
|--------|-----------------------------|--------------------------------------------------|
| GET    | /api/events                 | List events (filtered by region/rep). Query: start, end, region |
| GET    | /api/events/:id             | Event detail with attendees                     |
| POST   | /api/events                 | Create event + attendees                         |
| PATCH  | /api/events/:id             | Update event                                     |
| DELETE | /api/events/:id             | Cancel (soft: status=cancelled)                  |

## 7) Calendar component (free, native-like)

**Recommended:** FullCalendar Vue 3 (MIT) or Schedule-X (MIT, actively maintained).

- **FullCalendar:** Mature, Google-like, MIT for core + daygrid/week/day views. Plugins: `@fullcalendar/core`, `@fullcalendar/vue3`, `@fullcalendar/daygrid`, `@fullcalendar/timegrid`, `@fullcalendar/interaction`.
- **Schedule-X:** Lighter, Vue-native, day/week/month views, drag-and-drop. `@schedule-x/vue`, `@schedule-x/calendar`, `@schedule-x/theme-default`.

Both are free and suitable for commercial use. FullCalendar is more “native calendar” feel; Schedule-X is simpler and Vue-first.

## 8) Visibility rules

- **Rep:** Own events only (`rep_id = current_user`) or events in own region (if configured).
- **Manager:** Events in their region.
- **Admin:** All events.

BFF enforces via `req.session.user.role` and `region`.

## 9) Acceptance criteria

- [ ] Calendar shows month/week/day views
- [ ] Create F2F and video events with multi-attendee (HCP/Lead)
- [ ] Edit and cancel events
- [ ] Events filtered by rep role/region
- [ ] Email activity stored in `tbl_communication_log`, not in planner
- [ ] Schema ready for PCF linkage (event_id on meetings later)

## 10) Test plan

- Unit: event CRUD, attendee merge
- Component: calendar renders events, create/edit modal
- E2E: create event → appears in calendar → edit → cancel
- BFF: region/role filtering

## 11) Documentation updates

- `foundation/modules/rep-app.md` – Planner section
- `foundation/docs/DATA_AND_API.md` – events API
- `foundation/docs/PLANNER_AND_EVENTS.md` – new doc (optional)

## 12) Dependencies

- SPEC-0015 (Meeting lifecycle) – future: link event_id to meeting
- SPEC-0001 (PCF) – PCF links to meeting; meeting can link to event
- SPEC-0013 (Leads, HCP, HCO) – attendees reference tbl_hcp, tbl_leads, tbl_hco

---

Date: 2026-02-19
