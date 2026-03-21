import { getDb } from "./connection.js";
import { AppError, DatabaseError } from "../errors.js";

export interface Event {
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

async function fetchAttendeesForEvents(
  eventIds: string[]
): Promise<Map<string, Event["attendees"]>> {
  if (eventIds.length === 0) return new Map();
  const result = await getDb().query<{ event_id: string; attendee_type: string; attendee_id: string; is_primary: boolean }>(
    "SELECT event_id, attendee_type, attendee_id, is_primary FROM tbl_event_attendees WHERE event_id = ANY($1::uuid[])",
    [eventIds]
  );
  const map = new Map<string, Event["attendees"]>();
  for (const a of result.rows) {
    const list = map.get(a.event_id) ?? [];
    list.push({ attendee_type: a.attendee_type as "hcp" | "hco" | "lead", attendee_id: a.attendee_id, is_primary: a.is_primary ?? false });
    map.set(a.event_id, list);
  }
  return map;
}

export async function getEvents(filters: GetEventsFilters): Promise<{ rows: Event[] }> {
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
  try {
    const result = await getDb().query<Event>(
      `SELECT e.id, e.rep_id, e.start_at, e.end_at, e.type, e.title, e.location, e.video_link, e.notes, e.region, e.status
       FROM tbl_events e ${whereClause} ORDER BY e.start_at ASC`,
      params
    );
    const attendeesMap = await fetchAttendeesForEvents(result.rows.map((r) => r.id));
    const rows = result.rows.map((r) => ({ ...r, attendees: attendeesMap.get(r.id) ?? [] }));
    return { rows };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("getEvents", err);
  }
}

export async function getEventById(id: string): Promise<Event | null> {
  try {
    const result = await getDb().query<Event>(
      "SELECT id, rep_id, start_at, end_at, type, title, location, video_link, notes, region, status FROM tbl_events WHERE id = $1",
      [id]
    );
    const r = result.rows[0];
    if (!r) return null;
    const attendeesMap = await fetchAttendeesForEvents([id]);
    return { ...r, attendees: attendeesMap.get(id) ?? [] };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("getEventById", err);
  }
}

export async function insertEvent(input: InsertEventInput): Promise<Event> {
  try {
    const result = await getDb().query<Event>(
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
    if (!event) throw new DatabaseError("insertEvent", new Error("Insert returned no rows"));

    const attendees = Array.isArray(input.attendees) ? input.attendees : [];
    for (const a of attendees) {
      if (a?.attendee_type && a?.attendee_id) {
        await getDb().query(
          `INSERT INTO tbl_event_attendees (event_id, attendee_type, attendee_id, is_primary)
           VALUES ($1, $2, $3, $4)`,
          [event.id, a.attendee_type, a.attendee_id, a.is_primary ?? false]
        );
      }
    }
    return { ...event, attendees };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("insertEvent", err);
  }
}

export async function updateEvent(id: string, input: UpdateEventInput): Promise<Event | null> {
  const existing = await getEventById(id);
  if (!existing) return null;

  try {
    const updates: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    const push = (sql: string, val: unknown) => { updates.push(sql.replace("?", `$${paramIndex++}`)); params.push(val); };
    if (input.title !== undefined)      push("title = ?",                 input.title?.trim() || null);
    if (input.start_at !== undefined)   push("start_at = ?::timestamptz", input.start_at);
    if (input.end_at !== undefined)     push("end_at = ?::timestamptz",   input.end_at);
    if (input.type !== undefined)       push("type = ?",                  input.type);
    if (input.status !== undefined)     push("status = ?",                input.status);
    if (input.location !== undefined)   push("location = ?",              input.location?.trim() || null);
    if (input.video_link !== undefined) push("video_link = ?",            input.video_link?.trim() || null);
    if (input.notes !== undefined)      push("notes = ?",                 input.notes?.trim() || null);
    if (input.region !== undefined)     push("region = ?",                input.region.trim());

    if (updates.length > 0) {
      updates.push(`updated_at = now()`);
      params.push(id);
      await getDb().query(`UPDATE tbl_events SET ${updates.join(", ")} WHERE id = $${paramIndex}`, params);
    }

    if (Array.isArray(input.attendees)) {
      await getDb().query("DELETE FROM tbl_event_attendees WHERE event_id = $1", [id]);
      for (const a of input.attendees) {
        if (a?.attendee_type && a?.attendee_id) {
          await getDb().query(
            `INSERT INTO tbl_event_attendees (event_id, attendee_type, attendee_id, is_primary)
             VALUES ($1, $2, $3, $4)`,
            [id, a.attendee_type, a.attendee_id, a.is_primary ?? false]
          );
        }
      }
    }

    return getEventById(id);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("updateEvent", err);
  }
}
