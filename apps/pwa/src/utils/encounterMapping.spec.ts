import { describe, it, expect } from "vitest";
import { toEncounterBody, fromEncounter } from "./encounterMapping";
import type { EventSubmitPayload } from "../components/EventForm.types";

const payload: EventSubmitPayload = {
  title: "Visita Dra. López",
  start_at: "2026-10-01T10:00:00.000Z",
  end_at: "2026-10-01T11:00:00.000Z",
  type: "video",
  status: "scheduled",
  location: null,
  video_link: "https://meet.example.com/abc",
  notes: "Traer muestras",
  region: "MX",
  attendees: [
    { attendee_type: "hco", attendee_id: "11111111-1111-1111-1111-111111111111", is_primary: false },
    { attendee_type: "doctor", attendee_id: "22222222-2222-2222-2222-222222222222", is_primary: false },
  ],
};

describe("encounterMapping (NEO-112)", () => {
  it("sends only values the encounter API accepts", () => {
    const body = toEncounterBody(payload);
    expect(body.type).toBe("call");
    expect(toEncounterBody({ ...payload, type: "f2f" }).type).toBe("visit");
    expect(body.status).toBe("scheduled");
    expect(body.attendees).toEqual([
      "hco:11111111-1111-1111-1111-111111111111",
      "doctor:22222222-2222-2222-2222-222222222222",
    ]);
    expect(body.metadata).toEqual({ title: "Visita Dra. López", location: null, video_link: "https://meet.example.com/abc" });
    expect(body).not.toHaveProperty("title");
  });

  it("reads a saved encounter back into what the form sent", () => {
    const body = toEncounterBody(payload);
    const event = fromEncounter({ id: "e1", ...body } as Parameters<typeof fromEncounter>[0]);
    expect(event).toMatchObject({
      id: "e1",
      title: "Visita Dra. López",
      type: "video",
      status: "scheduled",
      video_link: "https://meet.example.com/abc",
      notes: "Traer muestras",
      region: "MX",
    });
    expect(event.attendees).toEqual(payload.attendees.map(({ attendee_type, attendee_id }) => ({ attendee_type, attendee_id })));
  });

  it("tolerates rows written before the mapping (no metadata, bare ids)", () => {
    const event = fromEncounter({ id: "e2", start_at: "2026-10-01T10:00:00Z", type: "congress", attendees: ["not-typed"] });
    expect(event).toMatchObject({ title: "", type: "f2f", status: "scheduled", attendees: [] });
  });
});
