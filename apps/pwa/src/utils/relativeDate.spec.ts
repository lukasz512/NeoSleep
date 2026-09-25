import { describe, it, expect } from "vitest";
import { formatDateShort, formatRelativeToNow } from "./relativeDate";

const now = new Date(2026, 8, 25, 12, 0); // 2026-09-25 local noon

describe("formatRelativeToNow", () => {
  it("uses today/yesterday and days for the last week", () => {
    expect(formatRelativeToNow(new Date(2026, 8, 25, 8).toISOString(), "en", now)).toBe("today");
    expect(formatRelativeToNow(new Date(2026, 8, 24, 23).toISOString(), "en", now)).toBe("yesterday");
    expect(formatRelativeToNow(new Date(2026, 8, 22).toISOString(), "en", now)).toBe("3 days ago");
  });

  it("steps up to weeks, months and years", () => {
    expect(formatRelativeToNow(new Date(2026, 8, 11).toISOString(), "en", now)).toBe("2 weeks ago");
    expect(formatRelativeToNow(new Date(2026, 5, 25).toISOString(), "en", now)).toBe("3 months ago");
    expect(formatRelativeToNow(new Date(2024, 8, 25).toISOString(), "en", now)).toBe("2 years ago");
  });

  it("follows the locale and tolerates missing/invalid input", () => {
    expect(formatRelativeToNow(new Date(2026, 8, 22).toISOString(), "es-MX", now)).toBe("hace 3 días");
    expect(formatRelativeToNow(null, "en", now)).toBe("");
    expect(formatDateShort("not a date", "en")).toBe("");
  });
});
