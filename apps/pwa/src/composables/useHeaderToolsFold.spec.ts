import { describe, it, expect } from "vitest";
import { nextFolded } from "./useHeaderToolsFold";

// NEO-113 option C: the title keeps its full name first; Filter / + fold into "⋯".
describe("nextFolded", () => {
  const widths = { unfoldedWidth: 150, foldedWidth: 100 }; // folding frees 50px

  it("stays unfolded while the whole title fits", () => {
    expect(nextFolded({ folded: false, natural: 120, avail: 120, ...widths })).toBe(false);
  });

  it("folds as soon as the title is cut", () => {
    expect(nextFolded({ folded: false, natural: 200, avail: 120, ...widths })).toBe(true);
  });

  it("stays folded when unfolding would cut the title again (no flip-flop)", () => {
    // Folded, the title fits in 170px; with the tools back it would have 120px.
    expect(nextFolded({ folded: true, natural: 160, avail: 170, ...widths })).toBe(true);
  });

  it("unfolds once the title would fit even with Filter / + back", () => {
    expect(nextFolded({ folded: true, natural: 110, avail: 170, ...widths })).toBe(false);
  });
});
