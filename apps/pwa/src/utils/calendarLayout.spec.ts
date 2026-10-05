import { describe, it, expect } from "vitest";
import {
  calendarMotion,
  dateKey,
  fetchWindow,
  inWindow,
  layoutDay,
  minutesAtOffset,
  monthCells,
  parseWallTime,
  startOfWeek,
  stepAnchor,
  viewWindow,
  weekDays,
} from "./calendarLayout";

// 2026-10-04 is a Sunday.
const SUN = new Date(2026, 9, 4, 15, 30);

describe("calendarLayout (CORE-122)", () => {
  it("weeks start on Monday, also when the anchor is a Sunday", () => {
    expect(dateKey(startOfWeek(SUN))).toBe("2026-09-28");
    expect(weekDays(SUN).map((d) => d.getDay())).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });

  it("the day window is one local day starting at midnight", () => {
    const { start, end } = viewWindow("day", SUN);
    expect(dateKey(start)).toBe("2026-10-04");
    expect(start.getHours()).toBe(0);
    expect(dateKey(end)).toBe("2026-10-05");
  });

  it("CORE-139: the fetch window pads the view by 2 days each side, so a clinic zone up to 26 h away still lands in it", () => {
    const { start, end } = fetchWindow("week", SUN);
    expect(dateKey(start)).toBe("2026-09-26");
    expect(dateKey(end)).toBe("2026-10-07");
  });

  it("CORE-139: an entry belongs to the view by its wall-clock day, not by its instant", () => {
    const week = viewWindow("week", SUN);
    expect(inWindow("2026-09-28", week)).toBe(true);
    expect(inWindow("2026-10-04", week)).toBe(true);
    expect(inWindow("2026-09-27", week)).toBe(false);
    expect(inWindow("2026-10-05", week)).toBe(false);
  });

  it("the week window is Monday to next Monday", () => {
    const { start, end } = viewWindow("week", SUN);
    expect(dateKey(start)).toBe("2026-09-28");
    expect(dateKey(end)).toBe("2026-10-05");
  });

  it("the month grid shows 6 full weeks covering the whole month, Monday first", () => {
    const cells = monthCells(SUN);
    expect(cells).toHaveLength(42);
    expect(dateKey(cells[0]!)).toBe("2026-09-28");
    expect(cells[0]!.getDay()).toBe(1);
    expect(cells.some((d) => dateKey(d) === "2026-10-31")).toBe(true);
    const { start, end } = viewWindow("month", SUN);
    expect(dateKey(start)).toBe("2026-09-28");
    expect(dateKey(end)).toBe(dateKey(new Date(2026, 10, 9)));
  });

  it("prev/next moves a day, a week, or to the 1st of the next month", () => {
    expect(dateKey(stepAnchor("day", SUN, 1))).toBe("2026-10-05");
    expect(dateKey(stepAnchor("week", SUN, -1))).toBe("2026-09-27");
    expect(dateKey(stepAnchor("month", new Date(2026, 0, 31), 1))).toBe("2026-02-01");
  });

  it("zooms in towards the day, out towards the month, slides for time", () => {
    expect(calendarMotion("month", "day", SUN, SUN)).toBe("in");
    expect(calendarMotion("day", "week", SUN, SUN)).toBe("out");
    expect(calendarMotion("week", "week", SUN, new Date(2026, 9, 11))).toBe("next");
    expect(calendarMotion("week", "week", SUN, new Date(2026, 8, 27))).toBe("prev");
    expect(calendarMotion("day", "day", SUN, new Date(2026, 9, 4, 9))).toBe("none");
  });

  it("parses a zoned wall time into its day and minutes", () => {
    expect(parseWallTime("2026-10-04 09:45")).toEqual({ key: "2026-10-04", minutes: 585 });
  });

  it("puts overlapping items side by side and leaves lone items full width", () => {
    const placed = layoutDay([
      { id: "a", startMin: 540, endMin: 600 },
      { id: "b", startMin: 570, endMin: 630 },
      { id: "c", startMin: 600, endMin: 660 }, // free again in a's column once a ends
      { id: "d", startMin: 720, endMin: 780 }, // its own group
    ]);
    const by = Object.fromEntries(placed.map((p) => [p.item.id, p]));
    expect(by.a).toMatchObject({ lane: 0, lanes: 2 });
    expect(by.b).toMatchObject({ lane: 1, lanes: 2 });
    expect(by.c).toMatchObject({ lane: 0, lanes: 2 });
    expect(by.d).toMatchObject({ lane: 0, lanes: 1 });
  });

  it("a click position maps to a half-hour slot inside the day", () => {
    expect(minutesAtOffset(52 * 9 + 40, 52)).toBe(9 * 60 + 30);
    expect(minutesAtOffset(-10, 52)).toBe(0);
    expect(minutesAtOffset(52 * 30, 52)).toBe(23 * 60 + 30);
  });
});
