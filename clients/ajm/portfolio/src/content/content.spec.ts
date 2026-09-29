import { describe, expect, it } from "vitest";
import { MIN_PHOTOS, PRIVALIA_CHAPTERS, PRIVALIA_VISIBLE } from "./cases";
import { PLANETA_EVENTS, PLANETA_VISIBLE } from "./planeta";

// Łukasz, 2026-09-28: "every event shows at least 2 photos — anything less is not acceptable".
describe("content › every event on the page has at least 2 photos", () => {
  it("Privalia chapters", () => {
    expect(PRIVALIA_VISIBLE.length).toBeGreaterThan(0);
    for (const c of PRIVALIA_VISIBLE) expect(c.photos?.length ?? 0).toBeGreaterThanOrEqual(MIN_PHOTOS);
  });
  it("Grupo Planeta events", () => {
    expect(PLANETA_VISIBLE.length).toBeGreaterThan(0);
    for (const e of PLANETA_VISIBLE) expect(e.photos.length).toBeGreaterThanOrEqual(MIN_PHOTOS);
  });
  it("events without enough photos stay in the data, only hidden", () => {
    expect(PRIVALIA_CHAPTERS.length).toBeGreaterThan(PRIVALIA_VISIBLE.length);
    expect(PLANETA_EVENTS.length).toBeGreaterThanOrEqual(PLANETA_VISIBLE.length);
  });
});
