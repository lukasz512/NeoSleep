import { describe, expect, it } from "vitest";
import { applyTheme, initialTheme, revealRadius } from "./theme";

describe("theme › initial choice", () => {
  it("follows the device on a first visit", () => {
    expect(initialTheme(null, true)).toBe("dark");
    expect(initialTheme(null, false)).toBe("light");
  });
  it("a choice made with the switch wins over the device", () => {
    expect(initialTheme("light", true)).toBe("light");
    expect(initialTheme("dark", false)).toBe("dark");
  });
  it("ignores anything else found in storage", () => {
    expect(initialTheme("sepia", false)).toBe("light");
  });
});

describe("theme › apply", () => {
  it("sets data-theme and color-scheme on the root", () => {
    const el = document.createElement("html");
    applyTheme("dark", el);
    expect(el.dataset.theme).toBe("dark");
    expect(el.style.colorScheme).toBe("dark");
  });
});

describe("theme › reveal circle", () => {
  it("reaches the farthest corner from the switch", () => {
    // switch at the top-right corner of a 1000×800 viewport → the bottom-left corner is farthest
    expect(revealRadius(1000, 0, 1000, 800)).toBeCloseTo(Math.hypot(1000, 800));
    // centre → half the diagonal
    expect(revealRadius(500, 400, 1000, 800)).toBeCloseTo(Math.hypot(500, 400));
  });
});
