import { describe, it, expect } from "vitest";
import { formatFormDate, formatFormDateTime } from "./formDate.js";

describe("formatFormDate", () => {
  // 2026-09-05 03:30 UTC = 4 Sep 21:30 in Mexico City, 5 Sep 05:30 in Warsaw.
  const earlyUtc = new Date("2026-09-05T03:30:00Z");

  it("pads day and month, four-digit year, slash for Mexican forms", () => {
    expect(formatFormDate(new Date("2026-09-20T18:00:00Z"), "mx")).toBe("20/09/2026");
  });

  it("uses the clinic's time zone, not the server's", () => {
    expect(formatFormDate(earlyUtc, "mx")).toBe("04/09/2026");
    expect(formatFormDate(earlyUtc, "pl")).toBe("05.09.2026");
  });

  it("falls back to the Mexican format for an unknown locale", () => {
    expect(formatFormDate(new Date("2026-01-02T18:00:00Z"), "xx")).toBe("02/01/2026");
  });

  it("adds a 24-hour time for stamps", () => {
    expect(formatFormDateTime(earlyUtc, "mx")).toBe("04/09/2026 21:30");
    expect(formatFormDateTime(earlyUtc, "pl")).toBe("05.09.2026 05:30");
  });
});
