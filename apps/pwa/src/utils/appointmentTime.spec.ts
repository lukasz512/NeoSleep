import { describe, it, expect } from "vitest";
import { toZonedCalendarDateTime, toZonedInputValue, zonedInputToIso, zonedDateKey } from "./appointmentTime";

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
});
