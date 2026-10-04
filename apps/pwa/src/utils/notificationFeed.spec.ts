import { describe, it, expect } from "vitest";
import {
  badgeLabel,
  formatNotificationTime,
  groupNotifications,
  swipeOutcome,
  SWIPE_READ_DISTANCE,
  type FeedItem,
} from "./notificationFeed";

// Local wall-clock times: the buckets follow the user's own day.
const NOW = new Date(2026, 9, 4, 15, 0); // 4 Oct 2026, 15:00 local

function item(id: string, at: Date, extra: Partial<FeedItem> = {}): FeedItem {
  return { id, createdAt: at.toISOString(), readAt: null, actions: [], ...extra };
}

const CALL = [{ kind: "call" as const, href: "tel:+48600000000" }];

describe("groupNotifications (CORE-4)", () => {
  it("buckets by the user's local day: Needs action, Today, Yesterday, Earlier", () => {
    const groups = groupNotifications(
      [
        item("today", new Date(2026, 9, 4, 0, 5)),
        item("act", new Date(2026, 9, 1, 9, 0), { actions: CALL }),
        item("yesterday-late", new Date(2026, 9, 3, 23, 59)),
        item("yesterday-early", new Date(2026, 9, 3, 0, 0)),
        item("earlier", new Date(2026, 9, 2, 23, 59)),
      ],
      NOW,
    );
    expect(groups.map((g) => [g.key, g.items.map((i) => i.id)])).toEqual([
      ["needsAction", ["act"]],
      ["today", ["today"]],
      ["yesterday", ["yesterday-late", "yesterday-early"]],
      ["earlier", ["earlier"]],
    ]);
  });

  it("pins only unread events with actions; a read one falls back to its day", () => {
    const groups = groupNotifications(
      [item("done", new Date(2026, 9, 4, 9, 0), { actions: CALL, readAt: "2026-10-04T10:00:00Z" })],
      NOW,
    );
    expect(groups.map((g) => g.key)).toEqual(["today"]);
  });

  it("leaves out empty groups and keeps the newest first inside each", () => {
    const groups = groupNotifications(
      [item("old", new Date(2026, 9, 4, 8, 0)), item("new", new Date(2026, 9, 4, 14, 0))],
      NOW,
    );
    expect(groups).toEqual([{ key: "today", items: [expect.objectContaining({ id: "new" }), expect.objectContaining({ id: "old" })] }]);
  });
});

describe("formatNotificationTime (CORE-4)", () => {
  const labels = { now: "now", minutes: (n: number) => `${n} min` };
  const fmt = (at: Date) => formatNotificationTime(at.toISOString(), NOW, "en-GB", labels);

  it("says 'now' under a minute and '12 min' under an hour", () => {
    expect(fmt(new Date(2026, 9, 4, 14, 59, 30))).toBe("now");
    expect(fmt(new Date(2026, 9, 4, 14, 48))).toBe("12 min");
    expect(fmt(new Date(2026, 9, 4, 14, 0, 1))).toBe("59 min");
  });

  it("shows the clock time for the rest of today", () => {
    expect(fmt(new Date(2026, 9, 4, 9, 5))).toBe("09:05");
  });

  it("shows a short date for older days, with the year only when it differs", () => {
    expect(fmt(new Date(2026, 9, 3, 18, 0))).toBe("3 Oct");
    expect(fmt(new Date(2025, 11, 30, 18, 0))).toBe("30 Dec 2025");
  });

  it("returns an empty string for an unparseable date", () => {
    expect(formatNotificationTime("nope", NOW, "en-GB", labels)).toBe("");
  });
});

describe("badgeLabel (CORE-4)", () => {
  it("is empty at 0, the number up to 9, then 9+", () => {
    expect(badgeLabel(0)).toBe("");
    expect(badgeLabel(1)).toBe("1");
    expect(badgeLabel(9)).toBe("9");
    expect(badgeLabel(10)).toBe("9+");
    expect(badgeLabel(120)).toBe("9+");
  });
});

describe("swipeOutcome (CORE-4)", () => {
  it("marks read past 72 px to the left; anything shorter springs back", () => {
    expect(SWIPE_READ_DISTANCE).toBe(72);
    expect(swipeOutcome(-72)).toBe("read");
    expect(swipeOutcome(-140)).toBe("read");
    expect(swipeOutcome(-71)).toBe("back");
    expect(swipeOutcome(90)).toBe("back");
  });
});
