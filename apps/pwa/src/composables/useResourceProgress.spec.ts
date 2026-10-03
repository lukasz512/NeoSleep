import { describe, it, expect } from "vitest";
import { resumeAt, filterByStatus, countByStatus, type ResourceProgress } from "./useResourceProgress";

/** NEO-209: when a webinar offers to resume, and how the status chips count. */
function p(resourceId: string, status: ResourceProgress["status"], positionSec = 0): ResourceProgress {
  return { resourceId, status, source: "watched", positionSec, durationSec: 600, percent: 0, completedAt: null, updatedAt: "" };
}

describe("resumeAt", () => {
  it("offers to resume from the saved second", () => {
    expect(resumeAt(p("1", "in_progress", 252), 600)).toBe(252);
  });
  it("no prompt without a position, under 10 s, or in the last 5 % (would land on the credits)", () => {
    expect(resumeAt(undefined, 600)).toBeNull();
    expect(resumeAt(p("1", "in_progress", 9), 600)).toBeNull();
    expect(resumeAt(p("1", "completed", 571), 600)).toBeNull();
    expect(resumeAt(p("1", "completed", 300), 600)).toBe(300);
  });
  it("falls back to the stored duration when the player doesn't know it yet", () => {
    expect(resumeAt(p("1", "in_progress", 590), null)).toBeNull();
  });
});

describe("status chips", () => {
  const videos = [{ id: "1" }, { id: "2" }, { id: "3" }, { id: "4" }];
  const progress = { "1": p("1", "completed"), "2": p("2", "in_progress", 40), "3": p("3", "not_started") };

  it("counts every video once; no row means not started", () => {
    expect(countByStatus(videos, progress)).toEqual({ all: 4, not_started: 2, in_progress: 1, completed: 1 });
  });
  it("filters by status, 'all' keeps every video", () => {
    expect(filterByStatus(videos, progress, "all").map((v) => v.id)).toEqual(["1", "2", "3", "4"]);
    expect(filterByStatus(videos, progress, "not_started").map((v) => v.id)).toEqual(["3", "4"]);
    expect(filterByStatus(videos, progress, "completed").map((v) => v.id)).toEqual(["1"]);
  });
});
