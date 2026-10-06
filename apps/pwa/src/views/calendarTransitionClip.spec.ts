import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// CORE-165: the grid's View Transition snapshot is painted in the top-level
// ::view-transition overlay, which ignores .cal__main's overflow: hidden. Without
// a clip on the group, the 18% slide and the 1.5x zoom spill over the sidebar and
// past the right edge. jsdom has no View Transitions, so the rule itself is checked.

const source = readFileSync(path.resolve(__dirname, "CalendarView.vue"), "utf-8");

describe("calendar view-change motion (CORE-165)", () => {
  it("clips the cal-body transition group to the grid box", () => {
    const rule = source.match(/html\[data-cal-transition\]::view-transition-group\(cal-body\)\s*\{([^}]*)\}/);
    expect(rule, "cal-body group rule").not.toBeNull();
    expect(rule?.[1]).toMatch(/overflow:\s*clip;/);
  });
});
