import { describe, it, expect } from "vitest";
import { fitFontSize, FIT_TITLE_MIN_PX } from "./useFitTitle";

// NEO-158: the record name stays on one line — shrink to fit, then "…".

describe("fitFontSize", () => {
  it("keeps the CSS size while the name fits", () => {
    expect(fitFontSize(300, 250, 24)).toBe(24);
    expect(fitFontSize(300, 300, 24)).toBe(24);
  });

  it("shrinks in proportion to fit the room", () => {
    // 240 px of room for a name 288 px wide at 24 px → 20 px.
    expect(fitFontSize(240, 288, 24)).toBe(20);
  });

  it("never goes below the 18 px floor (the rest is cut with an ellipsis)", () => {
    expect(fitFontSize(100, 400, 24)).toBe(FIT_TITLE_MIN_PX);
  });

  it("does nothing when there is no room to measure (hidden)", () => {
    expect(fitFontSize(0, 400, 24)).toBe(24);
  });
});
