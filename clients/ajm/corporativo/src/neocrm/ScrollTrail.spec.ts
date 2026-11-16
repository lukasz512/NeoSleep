import { afterEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import ScrollTrail from "./ScrollTrail.vue";
import NeoCrmApp from "./NeoCrmApp.vue";
import { makeNeoCrmI18n } from "./i18n";
import { TRAIL_STAGES, trailPath, trailStage, trailX } from "./trail";

/** Pretends the reader is `y` px down a page whose scroll range is 4000 px. */
function scrollTo(y: number) {
  Object.defineProperty(document.documentElement, "scrollHeight", { configurable: true, value: 4000 + window.innerHeight });
  Object.defineProperty(window, "scrollY", { configurable: true, value: y });
  window.dispatchEvent(new Event("scroll"));
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
});

describe("neocrm page › scroll trail, the thing that travels with the reader (CORE-215 round 6)", () => {
  it("the object goes through six shapes: note, stack, box, sealed, parcel, plane", () => {
    expect(TRAIL_STAGES).toEqual(["note", "stack", "box", "sealed", "parcel", "plane"]);
    expect(trailStage(0)).toEqual({ stage: 0, p: 0 });
    expect(trailStage(0.5)).toEqual({ stage: 3, p: 0 });
    expect(trailStage(0.25).stage).toBe(1);
    expect(trailStage(0.25).p).toBeCloseTo(0.5);
    expect(trailStage(1)).toEqual({ stage: 5, p: 1 });
  });
  it("progress outside the page is clamped", () => {
    expect(trailStage(-2)).toEqual({ stage: 0, p: 0 });
    expect(trailStage(7)).toEqual({ stage: 5, p: 1 });
    expect(trailStage(Number.NaN)).toEqual({ stage: 0, p: 0 });
  });
  it("the thread never leaves its margin, however narrow", () => {
    for (const width of [16, 20, 48]) {
      for (let y = 0; y < 2000; y += 37) {
        expect(trailX(y, width)).toBeGreaterThanOrEqual(2);
        expect(trailX(y, width)).toBeLessThanOrEqual(width - 2);
      }
    }
    expect(trailPath(300, 48).startsWith("M")).toBe(true);
    expect(trailPath(0, 48)).toBe("");
  });

  it("starts as a loose note and is hidden from screen readers and the keyboard", () => {
    const w = mount(ScrollTrail, { attachTo: document.body });
    const trail = w.find(".trail");
    expect(trail.attributes("aria-hidden")).toBe("true");
    expect(trail.attributes("data-stage")).toBe("note");
    expect(trail.findAll("a, button, input, [tabindex]")).toHaveLength(0);
  });
  it("scrolling packs it: half way down the box is sealed, at the end the plane lands", async () => {
    const w = mount(ScrollTrail, { attachTo: document.body });
    scrollTo(2000);
    await w.vm.$nextTick();
    expect(w.find(".trail").attributes("data-stage")).toBe("sealed");
    expect(w.find(".trail").classes()).not.toContain("is-landed");
    scrollTo(4000);
    await w.vm.$nextTick();
    expect(w.find(".trail").attributes("data-stage")).toBe("plane");
    expect(w.find(".trail").classes()).toContain("is-landed");
  });
  it("is not drawn at all when the reader asked for reduced motion", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce"), addEventListener() {}, removeEventListener() {} }));
    const w = mount(ScrollTrail, { attachTo: document.body });
    expect(w.find(".trail").exists()).toBe(false);
  });
  it("stops listening when the page goes away", async () => {
    const w = mount(ScrollTrail, { attachTo: document.body });
    const trail = w.find(".trail").element;
    w.unmount();
    scrollTo(4000);
    expect(trail.getAttribute("data-stage")).toBe("note");
  });

  it("the page has exactly one trail, outside the sections, with no warm accent of its own", () => {
    const w = mount(NeoCrmApp, { props: { locale: "es", search: "" }, global: { plugins: [makeNeoCrmI18n("es")] }, attachTo: document.body });
    expect(w.findAll(".trail")).toHaveLength(1);
    expect(w.find("main .trail").exists()).toBe(false);
    expect(w.find(".trail .is-warm").exists()).toBe(false);
    expect(w.find(".trail").html()).not.toContain("--ncrm-warm");
  });
});
