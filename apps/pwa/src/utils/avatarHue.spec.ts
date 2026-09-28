import { describe, it, expect } from "vitest";
import { AVATAR_HUE_COUNT, avatarHueIndex } from "./avatarHue";

describe("avatarHueIndex", () => {
  it("is stable for the same name, ignoring case and outer spaces", () => {
    expect(avatarHueIndex("María López")).toBe(avatarHueIndex("  maría lópez "));
  });

  it("stays within the palette, including for empty input", () => {
    for (const n of ["", null, undefined, "A", "Dr. Anna Kowalska", "Adam Nowak"]) {
      const i = avatarHueIndex(n);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(AVATAR_HUE_COUNT);
    }
  });

  it("spreads a realistic list over several colors", () => {
    const names = ["Adam Nowak", "María López", "Anna Kowalska", "Jan Wiśniewski", "Carlos Ruiz", "Ewa Zielińska", "Beata Kaczmarek", "Tomás Herrera"];
    expect(new Set(names.map(avatarHueIndex)).size).toBeGreaterThanOrEqual(5);
  });
});
