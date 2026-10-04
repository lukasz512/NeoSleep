import { describe, it, expect } from "vitest";
import { isPageHeaderVisible } from "./usePageHeader";

describe("isPageHeaderVisible (CORE-129)", () => {
  it("shows the row by default, on desktop and phone", () => {
    expect(isPageHeaderVisible({ recordHeaderClaimed: false, isMobile: false, routeMeta: {} })).toBe(true);
    expect(isPageHeaderVisible({ recordHeaderClaimed: false, isMobile: true, routeMeta: {} })).toBe(true);
  });

  it("hides it while a detail view shows its record header (NEO-56)", () => {
    expect(isPageHeaderVisible({ recordHeaderClaimed: true, isMobile: false, routeMeta: {} })).toBe(false);
  });

  it("hides it on phones only, for a view that draws its own header there (Calendario)", () => {
    const routeMeta = { phoneOwnHeader: true };
    expect(isPageHeaderVisible({ recordHeaderClaimed: false, isMobile: true, routeMeta })).toBe(false);
    expect(isPageHeaderVisible({ recordHeaderClaimed: false, isMobile: false, routeMeta })).toBe(true);
  });
});
