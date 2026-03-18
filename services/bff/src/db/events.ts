import { getPool } from "./pool.js";

export interface EventRow {
  id: string;
  rep_id: string;
  start_at: Date;
  end_at: Date;
  type: "f2f" | "video";
  title: string | null;
  location: string | null;
  video_link: string | null;
  notes: string | null;
  region: string;
  status: "scheduled" | "completed" | "cancelled" | "no_show";
  attendees?: { attendee_type: "hcp" | "hco" | "lead"; attendee_id: string; is_primary?: boolean }[];
}

export interface GetEventsFilters {
  start?: string;
  end?: string;
  region?: string;
  repId?: string | null;
}

export interface InsertEventInput {
  rep_id: string;
  title?: string | null;
  start_at: string;
  end_at: string;
  type: "f2f" | "video";
  status?: "scheduled" | "completed" | "cancelled" | "no_show";
  location?: string | null;
  video_link?: string | null;
  notes?: string | null;
  region?: string;
  attendees?: { attendee_type: "hcp" | "hco" | "lead"; attendee_id: string; is_primary?: boolean }[];
}

export interface UpdateEventInput {
  title?: string;
  start_at?: string;
  end_at?: string;
  type?: "f2f" | "video";
  status?: "scheduled" | "completed" | "cancelled" | "no_show";
  location?: string | null;
  video_link?: string | null;
  notes?: string | null;
  region?: string;
  attendees?: { attendee_type: "hcp" | "hco" | "lead"; attendee_id: string; is_primary?: boolean }[];
}

/** Generate demo events relative to now (fallback when DB is unavailable). */
function getMockEvents(): EventRow[] {
  const mockRepId = "00000000-0000-0000-0000-000000000001";
  const at = (daysOffset: number, hour: number, minute = 0): Date => {
    const d = new Date();
    d.setDate(d.getDate() + daysOffset);
    d.setHours(hour, minute, 0, 0);
    return d;
  };
  const ev = (
    id: string,
    daysOffset: number,
    startHour: number,
    endHour: number,
    type: "f2f" | "video",
    title: string,
    region: string,
    status: "scheduled" | "completed" | "cancelled" | "no_show",
    location?: string
  ): EventRow => ({
    id,
    rep_id: mockRepId,
    start_at: at(daysOffset, startHour),
    end_at: at(daysOffset, endHour),
    type,
    title,
    location: location ?? null,
    video_link: null,
    notes: null,
    region,
    status,
    attendees: [],
  });

  return [
    ev("mock-ev-01",  0,  9, 10, "f2f",   "Dr Kowalska — Pulmonology · NeoSleep Intro",         "Central", "scheduled", "NeoSleep Care Center"),
    ev("mock-ev-02",  0, 11, 12, "video", "NeoSleep Product Webinar — North Region",              "North",   "scheduled"),
    ev("mock-ev-03",  0, 14, 15, "f2f",   "Dr Nowak — Sleep Medicine Review",                    "Central", "scheduled", "NeoSleep Care Center"),
    ev("mock-ev-04",  1,  9, 10, "f2f",   "Dr Wiśniewska — Clinical Evidence Presentation",      "North",   "scheduled", "City Hospital North"),
    ev("mock-ev-05",  1, 13, 14, "video", "Regional Alignment Call — South",                     "South",   "scheduled"),
    ev("mock-ev-06",  2, 10, 11, "f2f",   "Dr Wójcik — ENT & Sleep Apnea Consultation",         "South",   "scheduled", "Centrum Pulmonologii Południe"),
    ev("mock-ev-07",  2, 15, 16, "f2f",   "Dr Kaczmarek — OrthApnea Device Presentation",        "South",   "scheduled", "Centrum Pulmonologii Południe"),
    ev("mock-ev-08",  4,  9, 10, "video", "NeoSleep Weekly Sync — Central Region",               "Central", "scheduled"),
    ev("mock-ev-09",  4, 12, 13, "f2f",   "Dr Szymańska — Pneumonology Protocol Review",        "Central", "scheduled", "ENT & Sleep Clinic Centrum"),
    ev("mock-ev-10",  6, 10, 11, "video", "Dr Lewandowska — Sleep Apnea Follow-up",              "West",    "scheduled"),
    ev("mock-ev-11",  6, 14, 15, "f2f",   "Dr Zieliński — Internal Medicine · Referral Review",  "North",   "scheduled", "City Hospital North"),
    ev("mock-ev-12",  9,  9, 10, "f2f",   "OrthApnea Clinical Workshop — Centrum Pulmonologii",  "South",   "scheduled", "Centrum Pulmonologii Południe"),
    ev("mock-ev-13",  9, 13, 14, "f2f",   "Dr Jankowski — Quarterly Territory Review",           "Central", "scheduled", "NeoSleep Care Center"),
    ev("mock-ev-14", 12, 10, 11, "video", "Dr Kowalczyk — Pulmonology · Product Update Call",   "South",   "scheduled"),
    ev("mock-ev-15", 12, 15, 16, "f2f",   "Dr Dąbrowski — Family Medicine · First Visit",        "West",    "scheduled", "Klinika Zdrowia Zachód"),
    ev("mock-ev-16", 15, 11, 12, "f2f",   "Dr Pawlak — NeoSleep Program Kickoff",               "Central", "scheduled", "NeoSleep Care Center"),
    ev("mock-ev-17", 15, 14, 15, "video", "Monthly Territory Review — All Regions",              "Central", "scheduled"),
    ev("mock-ev-18", -1, 10, 11, "f2f",   "Dr Wiśniewski — ENT · Initial Consultation",         "North",   "completed", "City Hospital North"),
    ev("mock-ev-19", -2,  9, 10, "f2f",   "Dr Michalska — Sleep Screening Presentation",         "West",    "completed", "Klinika Zdrowia Zachód"),
    ev("mock-ev-20", -3, 13, 14, "video", "NeoSleep KOL Webinar Recap — South Region",           "South",   "completed"),
    ev("mock-ev-21", -5, 10, 11, "f2f",   "Dr Lewandowska — OrthApnea Protocol Discussion",      "West",    "completed", "Klinika Zdrowia Zachód"),
    ev("mock-ev-22", -4, 11, 12, "video", "Dr Adamski — Remote Consultation",                   "South",   "completed"),
    ev("mock-ev-23", -1, 14, 15, "f2f",   "Dr Mazur — Introductory Visit",                      "North",   "cancelled"),
    ev("mock-ev-24",  3, 10, 11, "f2f",   "Dr Wróbel — ENT Follow-up",                         "West",    "cancelled"),
  ];
}

/** Fetch attendees for multiple events in a single query, keyed by event_id. */
async function fetchAttendeesForEvents(
  p: NonNullable<ReturnType<typeof getPool>>,
  eventIds: string[]
): Promise<Map<string, EventRow["attendees"]>> {
  if (eventIds.length === 0) return new Map();
  const result = await p.query<{ event_id: string; attendee_type: string; attendee_id: string; is_primary: boolean }>(
    "SELECT event_id, attendee_type, attendee_id, is_primary FROM tbl_event_attendees WHERE event_id = ANY($1::uuid[])",
    [eventIds]
  );
  const map = new Map<string, EventRow["attendees"]>();
  for (const a of result.rows) {
    const list = map.get(a.event_id) ?? [];
    list.push({ attendee_type: a.attendee_type as "hcp" | "hco" | "lead", attendee_id: a.attendee_id, is_primary: a.is_primary ?? false });
    map.set(a.event_id, list);
  }
  return map;
}

export async function getEvents(filters: GetEventsFilters): Promise<{ rows: EventRow[] }> {
  const p = getPool();
  if (!p) return { rows: getMockEvents() };
  try {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filters.start?.trim()) {
      conditions.push(`e.end_at >= $${paramIndex}::timestamptz`);
      params.push(filters.start.trim());
      paramIndex++;
    }
    if (filters.end?.trim()) {
      conditions.push(`e.start_at <= $${paramIndex}::timestamptz`);
      params.push(filters.end.trim());
      paramIndex++;
    }
    if (filters.region?.trim()) {
      conditions.push(`e.region = $${paramIndex}`);
      params.push(filters.region.trim());
      paramIndex++;
    }
    if (filters.repId?.trim()) {
      conditions.push(`e.rep_id = $${paramIndex}`);
      params.push(filters.repId.trim());
      paramIndex++;
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const result = await p.query<EventRow>(
      `SELECT e.id, e.rep_id, e.start_at, e.end_at, e.type, e.title, e.location, e.video_link, e.notes, e.region, e.status
       FROM tbl_events e ${whereClause} ORDER BY e.start_at ASC`,
      params
    );
    const attendeesMap = await fetchAttendeesForEvents(p, result.rows.map((r) => r.id));
    const rows = result.rows.map((r) => ({ ...r, attendees: attendeesMap.get(r.id) ?? [] }));
    return { rows };
  } catch (err) {
    console.error("getEvents error:", err);
    return { rows: [] };
  }
}

export async function getEventById(id: string): Promise<EventRow | null> {
  const p = getPool();
  if (!p) return null;
  try {
    const result = await p.query<EventRow>(
      "SELECT id, rep_id, start_at, end_at, type, title, location, video_link, notes, region, status FROM tbl_events WHERE id = $1",
      [id]
    );
    const r = result.rows[0];
    if (!r) return null;
    const attendeesMap = await fetchAttendeesForEvents(p, [id]);
    return { ...r, attendees: attendeesMap.get(id) ?? [] };
  } catch (err) {
    console.error("getEventById error:", err);
    return null;
  }
}

export async function insertEvent(input: InsertEventInput): Promise<EventRow | null> {
  const p = getPool();
  if (!p) return null;
  try {
    const result = await p.query<EventRow>(
      `INSERT INTO tbl_events (rep_id, start_at, end_at, type, title, location, video_link, notes, region, status)
       VALUES ($1, $2::timestamptz, $3::timestamptz, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, rep_id, start_at, end_at, type, title, location, video_link, notes, region, status`,
      [
        input.rep_id,
        input.start_at,
        input.end_at,
        input.type,
        input.title?.trim() || null,
        input.location?.trim() || null,
        input.video_link?.trim() || null,
        input.notes?.trim() || null,
        input.region ?? "",
        input.status ?? "scheduled",
      ]
    );
    const event = result.rows[0];
    if (!event) return null;

    const attendees = Array.isArray(input.attendees) ? input.attendees : [];
    for (const a of attendees) {
      if (a?.attendee_type && a?.attendee_id) {
        await p.query(
          `INSERT INTO tbl_event_attendees (event_id, attendee_type, attendee_id, is_primary)
           VALUES ($1, $2, $3, $4)`,
          [event.id, a.attendee_type, a.attendee_id, a.is_primary ?? false]
        );
      }
    }
    return { ...event, attendees };
  } catch (err) {
    console.error("insertEvent error:", err);
    return null;
  }
}

export async function updateEvent(id: string, input: UpdateEventInput): Promise<EventRow | null> {
  const p = getPool();
  if (!p) return null;
  try {
    const existing = await getEventById(id);
    if (!existing) return null;

    const updates: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    const push = (sql: string, val: unknown) => { updates.push(sql.replace("?", `$${paramIndex++}`)); params.push(val); };
    if (input.title !== undefined)     push("title = ?",                  input.title?.trim() || null);
    if (input.start_at !== undefined)  push("start_at = ?::timestamptz",  input.start_at);
    if (input.end_at !== undefined)    push("end_at = ?::timestamptz",    input.end_at);
    if (input.type !== undefined)      push("type = ?",                   input.type);
    if (input.status !== undefined)    push("status = ?",                 input.status);
    if (input.location !== undefined)  push("location = ?",               input.location?.trim() || null);
    if (input.video_link !== undefined)push("video_link = ?",             input.video_link?.trim() || null);
    if (input.notes !== undefined)     push("notes = ?",                  input.notes?.trim() || null);
    if (input.region !== undefined)    push("region = ?",                 input.region.trim());

    if (updates.length > 0) {
      updates.push(`updated_at = now()`);
      params.push(id);
      await p.query(`UPDATE tbl_events SET ${updates.join(", ")} WHERE id = $${paramIndex}`, params);
    }

    if (Array.isArray(input.attendees)) {
      await p.query("DELETE FROM tbl_event_attendees WHERE event_id = $1", [id]);
      for (const a of input.attendees) {
        if (a?.attendee_type && a?.attendee_id) {
          await p.query(
            `INSERT INTO tbl_event_attendees (event_id, attendee_type, attendee_id, is_primary)
             VALUES ($1, $2, $3, $4)`,
            [id, a.attendee_type, a.attendee_id, a.is_primary ?? false]
          );
        }
      }
    }

    return getEventById(id);
  } catch (err) {
    console.error("updateEvent error:", err);
    return null;
  }
}
