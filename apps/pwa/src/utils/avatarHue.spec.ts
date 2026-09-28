import { describe, it, expect } from "vitest";
import { AVATAR_FAMILY_SIZES, avatarTintIndex } from "./avatarHue";

describe("avatarTintIndex", () => {
  it("is stable for the same name, ignoring case and outer spaces", () => {
    expect(avatarTintIndex("patient", "María López")).toBe(avatarTintIndex("patient", "  maría lópez "));
  });

  it("stays within its family, including for empty input", () => {
    for (const tone of ["patient", "doctor", "lead", "person"] as const) {
      for (const n of ["", null, undefined, "A", "Dr. Anna Kowalska", "Adam Nowak"]) {
        const i = avatarTintIndex(tone, n);
        expect(i).toBeGreaterThanOrEqual(0);
        expect(i).toBeLessThan(AVATAR_FAMILY_SIZES[tone]);
      }
    }
  });

  it("spreads a realistic list of patients over several tints", () => {
    const names = ["Adam Nowak", "María López", "Anna Kowalska", "Jan Wiśniewski", "Carlos Ruiz", "Ewa Zielińska", "Beata Kaczmarek", "Tomás Herrera"];
    expect(new Set(names.map((n) => avatarTintIndex("patient", n))).size).toBeGreaterThanOrEqual(3);
  });

  it("tints organizations by type, one tint per type, unknown types as a clinic", () => {
    const types = ["clinic", "hospital", "pharmacy", "practice", "other"];
    expect(new Set(types.map((t) => avatarTintIndex("org", t))).size).toBe(types.length);
    expect(avatarTintIndex("org", "something_new")).toBe(avatarTintIndex("org", "clinic"));
    expect(avatarTintIndex("org", null)).toBe(avatarTintIndex("org", "clinic"));
  });
});
