import { describe, it, expect } from "vitest";
import { toZonedCalendarDateTime, toZonedInputValue, zonedInputToIso, zonedDateKey, takenIntervalsOnDay, defaultBookingWall } from "./appointmentTime";

describe("appointmentTime (clinic-zone times, NEO-34)", () => {
  it("shows a UTC instant as the clinic's wall-clock time", () => {
    // 16:00Z = 10:00 in Mexico City (UTC-6, no DST since 2022) = 18:00 in Warsaw (CEST in September).
    expect(toZonedCalendarDateTime("2031-09-10T16:00:00.000Z", "America/Mexico_City")).toBe("2031-09-10 10:00");
    expect(toZonedCalendarDateTime("2031-09-10T16:00:00.000Z", "Europe/Warsaw")).toBe("2031-09-10 18:00");
  });

  it("round-trips a datetime-local value through the clinic's zone, including across DST", () => {
    for (const [wall, zone] of [
      ["2031-09-10T10:00", "America/Mexico_City"],
      ["2031-01-15T09:30", "Europe/Warsaw"],
      ["2031-07-15T09:30", "Europe/Warsaw"],
    ] as const) {
      expect(toZonedInputValue(zonedInputToIso(wall, zone), zone)).toBe(wall);
    }
    expect(zonedInputToIso("2031-01-15T09:30", "Europe/Warsaw")).toBe("2031-01-15T08:30:00.000Z");
  });

  it("groups by the clinic's calendar day, not UTC's", () => {
    // 05:00Z on the 11th is still the 10th in Mexico City.
    expect(zonedDateKey("2031-09-11T05:00:00.000Z", "America/Mexico_City")).toBe("2031-09-10");
  });

  it("lists the doctor's other bookings that day as clinic-time intervals (NEO-132 taken slots)", () => {
    const zone = "America/Mexico_City";
    const appts = [
      { id: "a", status: "scheduled", start_at: "2031-09-10T16:00:00.000Z", end_at: "2031-09-10T17:00:00.000Z" }, // 10:00–11:00
      { id: "b", status: "cancelled", start_at: "2031-09-10T18:00:00.000Z", end_at: "2031-09-10T19:00:00.000Z" }, // frees its slot
      { id: "c", status: "scheduled", start_at: "2031-09-10T20:00:00.000Z", end_at: "2031-09-10T20:30:00.000Z" }, // the one being edited
      { id: "d", status: "scheduled", start_at: "2031-09-11T05:30:00.000Z", end_at: "2031-09-11T06:30:00.000Z" }, // 23:30–00:30, clipped
      { id: "e", status: "completed", start_at: "2031-09-12T16:00:00.000Z", end_at: "2031-09-12T17:00:00.000Z" }, // another day
    ];
    expect(takenIntervalsOnDay(appts, "2031-09-10", zone, "c")).toEqual([
      { start: "10:00", end: "11:00" },
      { start: "23:30", end: "23:59" },
    ]);
  });

  it("defaults a new booking to tomorrow as the viewer sees it, at the clinic's next full hour (CORE-167)", () => {
    // 00:30Z on 6 Oct = 02:30 on the 6th in Warsaw, still 18:30 on the 5th in Mexico City.
    const now = new Date("2026-10-06T00:30:00.000Z");
    expect(defaultBookingWall(now, "America/Mexico_City", "Europe/Warsaw")).toBe("2026-10-07T19:00");
    // Viewer in the clinic's zone: tomorrow, next full hour.
    const local = new Date("2026-10-06T16:10:00.000Z");
    expect(defaultBookingWall(local, "America/Mexico_City", "America/Mexico_City")).toBe("2026-10-07T11:00");
  });
});
