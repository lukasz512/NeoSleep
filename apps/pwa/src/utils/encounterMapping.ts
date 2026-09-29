import type { EventSubmitPayload } from "../components/EventForm.types";

/**
 * The event form (planner, clinic and lead views) and the API's encounter
 * speak different shapes (NEO-112): the form has a title, "f2f"/"video",
 * a location/video link and typed attendees; an encounter has a FHIR-aligned
 * type (visit/call/…), attendees as a text[] and no title/location columns.
 * Every screen that saves or shows an event goes through these two functions,
 * so the mapping lives in one place.
 *
 * - type: f2f ↔ visit (FHIR class AMB), video ↔ call (VR); webinar also reads as video.
 * - title, location, video_link → encounter.metadata.
 * - attendees → "hco:<id>" / "doctor:<id>" / "patient:<id>" / "lead:<id>" strings.
 */

type AttendeeType = EventSubmitPayload["attendees"][number]["attendee_type"];
const ATTENDEE_TYPES: readonly AttendeeType[] = ["doctor", "hco", "lead", "patient"];

/** The request body for POST /api/v1/encounter and PATCH /api/v1/encounter/:id. */
export function toEncounterBody(payload: EventSubmitPayload): Record<string, unknown> {
  return {
    start_at: payload.start_at,
    end_at: payload.end_at || null,
    type: payload.type === "video" ? "call" : "visit",
    status: payload.status,
    notes: payload.notes ?? null,
    region: payload.region || null,
    attendees: payload.attendees.map((a) => `${a.attendee_type}:${a.attendee_id}`),
    metadata: {
      title: payload.title,
      location: payload.location ?? null,
      video_link: payload.video_link ?? null,
    },
  };
}

/** What the planner shows and the form edits, read back from one encounter row. */
export interface PlannerEvent {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  type: "f2f" | "video";
  status: string;
  location?: string;
  video_link?: string;
  notes?: string;
  region?: string;
  attendees: { attendee_type: AttendeeType; attendee_id: string }[];
}

interface EncounterRow {
  id: string;
  start_at: string;
  end_at?: string | null;
  type?: string;
  status?: string;
  notes?: string | null;
  region?: string | null;
  attendees?: unknown;
  metadata?: Record<string, unknown> | null;
}

const text = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);

export function fromEncounter(row: EncounterRow): PlannerEvent {
  const meta = row.metadata ?? {};
  const attendees = (Array.isArray(row.attendees) ? row.attendees : []).flatMap((raw) => {
    if (typeof raw !== "string") return [];
    const [type, id] = raw.split(":");
    return ATTENDEE_TYPES.includes(type as AttendeeType) && id ? [{ attendee_type: type as AttendeeType, attendee_id: id }] : [];
  });
  return {
    id: row.id,
    title: text(meta.title) ?? "",
    start_at: row.start_at,
    end_at: row.end_at ?? "",
    type: row.type === "call" || row.type === "webinar" ? "video" : "f2f",
    status: row.status ?? "scheduled",
    location: text(meta.location),
    video_link: text(meta.video_link),
    notes: text(row.notes),
    region: text(row.region),
    attendees,
  };
}
