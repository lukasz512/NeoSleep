import { describe, it, expect } from "vitest";
import { buildAppointmentIcs, appointmentIcsUid, googleCalendarLink, outlookCalendarLink } from "./ics.js";

const base = {
  appointmentId: "11111111-2222-3333-4444-555555555555",
  sequence: 3,
  method: "REQUEST" as const,
  startAt: "2031-01-15T15:00:00.000Z",
  endAt: "2031-01-15T16:00:00.000Z",
  summary: "Cita · Clínica Sonrisa",
  location: "Av. Reforma 1, CDMX",
  description: "Para cambiar la cita, contacte a la clínica: +52 55 1234 5678",
  organizer: { name: "Clínica Sonrisa", email: "hola@sonrisa.mx" },
  attendeeEmail: "paciente@example.com",
};

describe("buildAppointmentIcs (CORE-26)", () => {
  it("is a valid VCALENDAR with CRLF line endings and UTC times", () => {
    const ics = buildAppointmentIcs(base);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("METHOD:REQUEST\r\n");
    expect(ics).toContain("DTSTART:20310115T150000Z\r\n");
    expect(ics).toContain("DTEND:20310115T160000Z\r\n");
    expect(ics).toContain("STATUS:CONFIRMED\r\n");
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/\n/);
  });

  it("keeps one stable UID per appointment and carries the SEQUENCE, so a reschedule updates the device calendar instead of duplicating", () => {
    const first = buildAppointmentIcs({ ...base, sequence: 1 });
    const moved = buildAppointmentIcs({ ...base, sequence: 2, startAt: "2031-01-16T15:00:00.000Z", endAt: "2031-01-16T16:00:00.000Z" });
    const uid = `UID:${appointmentIcsUid(base.appointmentId)}\r\n`;
    expect(first).toContain(uid);
    expect(moved).toContain(uid);
    expect(moved).toContain("SEQUENCE:2\r\n");
  });

  it("a cancellation uses METHOD:CANCEL and STATUS:CANCELLED with the same UID", () => {
    const ics = buildAppointmentIcs({ ...base, method: "CANCEL" });
    expect(ics).toContain("METHOD:CANCEL\r\n");
    expect(ics).toContain("STATUS:CANCELLED\r\n");
    expect(ics).toContain(`UID:${appointmentIcsUid(base.appointmentId)}`);
  });

  it("escapes commas, semicolons and newlines in text and folds lines longer than 75 octets", () => {
    const ics = buildAppointmentIcs({ ...base, location: "Calle 1, Piso 2; Puerta 3", description: `Línea uno\nLínea dos ${"x".repeat(120)}` });
    expect(ics).toContain("LOCATION:Calle 1\\, Piso 2\\; Puerta 3\r\n");
    expect(ics).toContain("Línea uno\\nLínea dos");
    for (const line of ics.split("\r\n")) expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
  });

  it("asks for no RSVP from the patient", () => {
    expect(buildAppointmentIcs(base)).toContain("RSVP=FALSE");
  });
});

describe("add-to-calendar links", () => {
  it("Google link carries the UTC range and title", () => {
    const url = new URL(googleCalendarLink(base));
    expect(url.hostname).toBe("calendar.google.com");
    expect(url.searchParams.get("dates")).toBe("20310115T150000Z/20310115T160000Z");
    expect(url.searchParams.get("text")).toBe(base.summary);
  });

  it("Outlook link carries ISO start and end", () => {
    const url = new URL(outlookCalendarLink(base));
    expect(url.hostname).toBe("outlook.live.com");
    expect(url.searchParams.get("startdt")).toBe(base.startAt);
    expect(url.searchParams.get("enddt")).toBe(base.endAt);
  });
});
