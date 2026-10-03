import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import MandibularRuler from "./MandibularRuler.vue";
import { INCISOR_TIP, rulerPercent } from "./mandibularRuler";

/**
 * Łukasz, 2026-10-03: on OrthoApnea's ruler the incisal TIPS touch the 0 line
 * by default; ours had the image centres there. jsdom has no layout, so the
 * tip's x is computed from the same inline style the browser applies:
 * left (% of the track) + translateX (% of the image's own width) + the tip's
 * offset inside the image (to 0.01 px — the transform is rounded to 3 decimals).
 */

const TRACK_PX = 400;

function tipX(img: HTMLImageElement, tip: { tipX: number; widthPx: number }): number {
  const left = (parseFloat(img.style.left) / 100) * TRACK_PX;
  const width = parseFloat(img.style.width);
  const translate = /translateX\((-?[\d.]+)%\)/.exec(img.style.transform);
  const shift = translate ? (parseFloat(translate[1]!) / 100) * width : 0;
  expect(width).toBe(tip.widthPx);
  return left + shift + tip.tipX * width;
}

function incisors(wrapper: ReturnType<typeof mount>) {
  return {
    sup: wrapper.find<HTMLImageElement>(".mandibular-ruler__incisor--sup").element,
    inf: wrapper.find<HTMLImageElement>(".mandibular-ruler__incisor--inf").element,
  };
}

describe("MandibularRuler", () => {
  it("with default values both incisor tips sit on the 0 line, not the image centres", () => {
    const wrapper = mount(MandibularRuler, { props: { retrusionMax: 0, protrusionMax: 0, startingPointMm: null } });
    const zero = (rulerPercent(0) / 100) * TRACK_PX;
    const { sup, inf } = incisors(wrapper);

    expect(tipX(sup, INCISOR_TIP.sup)).toBeCloseTo(zero, 2);
    expect(tipX(inf, INCISOR_TIP.inf)).toBeCloseTo(zero, 2);
    // The centre is NOT on 0 any more (that was the bug).
    expect((parseFloat(sup.style.left) / 100) * TRACK_PX).toBe(zero);
    expect(sup.style.transform).not.toBe("translateX(-50%)");
  });

  it("the lower tip follows the starting point while the upper stays on 0 (the fixed reference)", () => {
    const wrapper = mount(MandibularRuler, { props: { retrusionMax: -2, protrusionMax: 8, startingPointMm: 4 } });
    const { sup, inf } = incisors(wrapper);

    expect(tipX(sup, INCISOR_TIP.sup)).toBeCloseTo((rulerPercent(0) / 100) * TRACK_PX, 2);
    expect(tipX(inf, INCISOR_TIP.inf)).toBeCloseTo((rulerPercent(4) / 100) * TRACK_PX, 2);
    expect(wrapper.find(".mandibular-ruler__marker--sp").exists()).toBe(true);
  });

  it("maps ±20 mm to the full track and clamps beyond", () => {
    expect(rulerPercent(-20)).toBe(0);
    expect(rulerPercent(0)).toBe(50);
    expect(rulerPercent(20)).toBe(100);
    expect(rulerPercent(35)).toBe(100);
  });
});
