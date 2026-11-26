import { describe, it, expect } from "vitest";
import { wallTimeToUtc, utcToWallTime } from "./timezones.js";
import { ValidationError } from "../errors.js";

/**
 * CORE-120: the server owns the wall-clock → instant conversion. A booking
 * "15:00" is 15:00 in the clinic's zone, whatever zone the booker's device is
 * in (a PL admin booking an MX clinic saw 15:00 land at 07:00).
 */
describe("wallTimeToUtc", () => {
  it("reads the wall time in the clinic's zone, not the server's or the device's", () => {
    expect(wallTimeToUtc("2026-10-04T15:00", "America/Mexico_City")).toBe("2026-10-04T21:00:00.000Z");
    expect(wallTimeToUtc("2026-10-04T15:00", "Europe/Warsaw")).toBe("2026-10-04T13:00:00.000Z");
    expect(wallTimeToUtc("2026-12-04T15:00", "Europe/Warsaw")).toBe("2026-12-04T14:00:00.000Z");
    expect(wallTimeToUtc("2026-10-04T15:00", "Asia/Bangkok")).toBe("2026-10-04T08:00:00.000Z");
  });

  it("round-trips with utcToWallTime", () => {
    for (const zone of ["America/Mexico_City", "Europe/Warsaw", "Asia/Bangkok"]) {
      expect(utcToWallTime(wallTimeToUtc("2026-03-29T16:30", zone), zone)).toBe("2026-03-29T16:30");
    }
  });

  it("an ambiguous time (clocks go back) takes the earlier instant", () => {
    // Warsaw 2026-10-25: 03:00 CEST → 02:00 CET, so 02:30 happens twice.
    expect(wallTimeToUtc("2026-10-25T02:30", "Europe/Warsaw")).toBe("2026-10-25T00:30:00.000Z");
  });

  it("rejects a time that doesn't exist (clocks go forward)", () => {
    // Warsaw 2026-03-29: 02:00 CET → 03:00 CEST, 02:30 never happens.
    expect(() => wallTimeToUtc("2026-03-29T02:30", "Europe/Warsaw")).toThrow(ValidationError);
  });

  it("rejects malformed input, naming the field", () => {
    for (const bad of ["2026-10-04", "2026-10-04T25:00", "2026-13-01T10:00", "2026-02-30T10:00", "2026-10-04T15:00Z", "15:00"]) {
      expect(() => wallTimeToUtc(bad, "Europe/Warsaw"), bad).toThrow(ValidationError);
    }
    try {
      wallTimeToUtc("nope", "Europe/Warsaw");
    } catch (err) {
      expect((err as ValidationError).field).toBe("start_local");
    }
  });
});
