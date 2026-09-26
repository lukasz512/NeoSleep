import { describe, expect, it } from "vitest";
import { moonOffset, placeMoon } from "./authOrbGeometry";

// Card boxes as AuthView lays them out: 420px wide, centered, ~210px from the top.
const desktop = { width: 1441, height: 786, card: { top: 210, right: 1441 / 2 + 210 } };
const wide = { width: 1920, height: 1080, card: { top: 230, right: 960 + 210 } };
const tablet = { width: 768, height: 1024, card: { top: 230, right: 384 + 210 } };
const phone = { width: 390, height: 844, card: { top: 215, right: 390 - 16 } };

describe("placeMoon", () => {
  it.each([
    ["desktop", desktop],
    ["wide monitor", wide],
    ["tablet", tablet],
  ])("puts the moon on the big orb's ring, just right of the card (%s)", (_, s) => {
    const moon = placeMoon(s.width, s.height, s.card);
    expect(moon.visible).toBe(true);
    // Exactly on the ring.
    expect(Math.hypot(moon.x - moon.orbitX, moon.y - moon.orbitY)).toBeCloseTo(moon.orbitRadius, 6);
    // Center past the card's right edge, above the ring's center.
    expect(moon.x).toBeGreaterThan(s.card.right);
    expect(moon.y).toBeLessThan(moon.orbitY);
    // On screen.
    expect(moon.x).toBeLessThan(s.width);
    expect(moon.y).toBeGreaterThan(0);
  });

  it("moves the moon to the medium orb's ring on a phone, above the logo", () => {
    const moon = placeMoon(phone.width, phone.height, phone.card);
    expect(moon.visible).toBe(true);
    expect(moon.host).toBe("medium");
    expect(Math.hypot(moon.x - moon.orbitX, moon.y - moon.orbitY)).toBeCloseTo(moon.orbitRadius, 6);
    // Its whole disc stays above the logo block over the card.
    const radius = 0.08 * phone.height;
    expect(moon.y + radius).toBeLessThanOrEqual(phone.card.top - 75 + 1e-6);
    expect(moon.x).toBeGreaterThan(moon.orbitX);
  });

  it("keeps the moon on the big orb's ring wherever that ring reaches the card", () => {
    for (const s of [desktop, wide, tablet]) expect(placeMoon(s.width, s.height, s.card).host).toBe("big");
  });
});

describe("moonOffset", () => {
  const moon = placeMoon(desktop.width, desktop.height, desktop.card);

  it("is zero at rest", () => {
    const offset = moonOffset(moon, 0, 1);
    expect(offset.x).toBeCloseTo(0, 6);
    expect(offset.y).toBeCloseTo(0, 6);
  });

  it("keeps the moon on the ring while it sways and the big orb breathes", () => {
    const offset = moonOffset(moon, 0.05, 1.03);
    const distance = Math.hypot(moon.x + offset.x - moon.orbitX, moon.y + offset.y - moon.orbitY);
    expect(distance).toBeCloseTo(moon.orbitRadius * 1.03, 6);
  });
});
