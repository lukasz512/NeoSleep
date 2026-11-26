import { describe, it, expect, vi, afterEach } from "vitest";
import {
  DATE_DIGITS,
  busySlots,
  checkDateDigits,
  checkTimeDigits,
  dateFormatFor,
  formatDateDigits,
  formatTimeDigits,
  isoToDateDigits,
  onlyDigits,
  resolveBound,
  timeSlots,
} from "./dateField";

afterEach(() => vi.useRealTimers());

const PL = dateFormatFor("pl");
const MX = dateFormatFor("es-MX");
const EN = dateFormatFor("en-US");

describe("dateFormatFor — the field follows the app language", () => {
  it("PL types day.month.year, MX day/month/year, EN month/day/year", () => {
    expect(PL).toEqual({ order: ["d", "m", "y"], sep: "." });
    expect(MX).toEqual({ order: ["d", "m", "y"], sep: "/" });
    expect(EN).toEqual({ order: ["m", "d", "y"], sep: "/" });
  });
});

describe("typing mask", () => {
  it("draws separators only between typed parts, so Backspace never sticks on one", () => {
    expect(formatDateDigits("1", MX)).toBe("1");
    expect(formatDateDigits("10", MX)).toBe("10");
    expect(formatDateDigits("101", MX)).toBe("10/1");
    expect(formatDateDigits("10101990", MX)).toBe("10/10/1990");
    expect(formatDateDigits("10101990", PL)).toBe("10.10.1990");
  });

  it("a 5th year digit can't be typed — the reported 10/10/19900 bug", () => {
    expect(onlyDigits("10/10/19900", DATE_DIGITS)).toBe("10101990");
  });

  it("round-trips a stored ISO date in the locale's order", () => {
    expect(isoToDateDigits("1990-10-25", EN)).toBe("10251990");
    expect(isoToDateDigits("1990-10-25", MX)).toBe("25101990");
    expect(isoToDateDigits("garbage", MX)).toBe("");
  });

  it("time: colon after the hour", () => {
    expect(formatTimeDigits("1")).toBe("1");
    expect(formatTimeDigits("103")).toBe("10:3");
    expect(formatTimeDigits("1030")).toBe("10:30");
  });
});

describe("checkDateDigits", () => {
  it("empty is not an error — required is the form's rule", () => {
    expect(checkDateDigits("", MX)).toEqual({ iso: null, issue: null });
  });

  it("half-typed → incomplete, with the locale's pattern", () => {
    expect(checkDateDigits("1010", PL).issue).toEqual({ key: "app.dateField.incomplete", params: { format: "DD.MM.YYYY" } });
  });

  it("a complete valid date → ISO", () => {
    expect(checkDateDigits("10101990", MX)).toEqual({ iso: "1990-10-10", issue: null });
    expect(checkDateDigits("10251990", EN)).toEqual({ iso: "1990-10-25", issue: null });
  });

  it("month 13 → invalid month", () => {
    expect(checkDateDigits("01131990", MX).issue?.key).toBe("app.dateField.invalidMonth");
  });

  it("31/02 → names the month and its real length; 29/02 only in leap years", () => {
    const res = checkDateDigits("31022026", MX, { monthName: () => "febrero" });
    expect(res.issue).toEqual({ key: "app.dateField.invalidDay", params: { month: "febrero", year: 2026, days: 28 } });
    expect(checkDateDigits("29022024", MX).iso).toBe("2024-02-29");
    expect(checkDateDigits("29022026", MX).issue?.key).toBe("app.dateField.invalidDay");
    expect(checkDateDigits("00012026", MX).issue?.key).toBe("app.dateField.invalid");
  });

  it("min/max: 'today' as a bound reads as no future / no past", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 27, 12));
    const today = resolveBound("today");
    expect(today).toBe("2026-09-27");
    expect(checkDateDigits("28092026", MX, { max: today }).issue?.key).toBe("app.dateField.noFuture");
    expect(checkDateDigits("27092026", MX, { max: today }).iso).toBe("2026-09-27");
    expect(checkDateDigits("26092026", MX, { min: today }).issue?.key).toBe("app.dateField.noPast");
  });

  it("min/max as fixed dates name the bound in the locale's format", () => {
    expect(checkDateDigits("31121899", MX, { min: "1900-01-01" }).issue).toEqual({
      key: "app.dateField.beforeMin",
      params: { min: "01/01/1900" },
    });
    expect(checkDateDigits("01012031", PL, { max: "2030-12-31" }).issue).toEqual({
      key: "app.dateField.afterMax",
      params: { max: "31.12.2030" },
    });
  });
});

describe("checkTimeDigits", () => {
  it("valid, incomplete, out of range, before a minimum", () => {
    expect(checkTimeDigits("1030")).toEqual({ time: "10:30", issue: null });
    expect(checkTimeDigits("103").issue?.key).toBe("app.dateField.timeIncomplete");
    expect(checkTimeDigits("2460").issue?.key).toBe("app.dateField.timeInvalid");
    expect(checkTimeDigits("0900", { min: "10:00" }).issue?.key).toBe("app.dateField.noPastTime");
  });
});

describe("slots", () => {
  it("every 15 minutes from 07:00 to 21:00 by default", () => {
    const s = timeSlots();
    expect(s[0]).toBe("07:00");
    expect(s[1]).toBe("07:15");
    expect(s.at(-1)).toBe("21:00");
    expect(s).toHaveLength(57);
  });

  it("a slot is busy when a booking of that length would overlap a taken one", () => {
    const slots = ["09:00", "09:15", "09:30", "10:00", "10:30", "11:00"];
    const busy = busySlots(slots, [{ start: "10:00", end: "11:00" }], 60);
    // 09:00+60 ends exactly at 10:00 → free; 09:15 overlaps; 11:00 starts as it ends → free.
    expect([...busy]).toEqual(["09:15", "09:30", "10:00", "10:30"]);
  });
});
