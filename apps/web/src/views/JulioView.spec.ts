import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { julioContent } from "../config/julioContent";
import { julioHeroLabels } from "../config/julioHeroLabels";
import JulioView from "./JulioView.vue";

/**
 * NEO-267 — private proposal page at /julio.
 *   - renders from one content source in ES, with an EN toggle,
 *   - never mentions the product it must not mention,
 *   - claims no certification it does not hold,
 *   - keeps working when WebGL is unavailable (jsdom has none).
 */

vi.mock("@unhead/vue", () => ({ useHead: () => undefined }));

function mountView() {
  return mount(JulioView, { attachTo: document.body });
}

describe("JulioView", () => {
  it("renders the Spanish proposal by default", () => {
    const wrapper = mountView();
    expect(wrapper.find("h1").text()).toBe(julioContent.es.h1);
    expect(wrapper.findAll(".julio-card").length).toBeGreaterThan(5);
  });

  it("switches to English from the same content source", async () => {
    const wrapper = mountView();
    const buttons = wrapper.findAll(".julio-lang__btn");
    expect(buttons).toHaveLength(2);
    await buttons[1]!.trigger("click");
    expect(wrapper.find("h1").text()).toBe(julioContent.en.h1);
    expect(buttons[1]!.attributes("aria-pressed")).toBe("true");
  });

  it("falls back to the static image when WebGL is unavailable", () => {
    const wrapper = mountView();
    const img = wrapper.find("img[src='/images/julio/shot-order.jpg']");
    expect(img.exists()).toBe(true);
    // The image is decorative; the wrapper carries the accessible name.
    expect(wrapper.find("[role='img']").attributes("aria-label")).toBe(julioHeroLabels.es.alt);
  });

  it("never mentions the incumbent product, in either language", () => {
    const blob = JSON.stringify(julioContent).toLowerCase();
    expect(blob).not.toContain("apnea dock");
    expect(blob).not.toContain("apneadock");
  });

  it("claims no certificate it does not hold", () => {
    for (const lang of ["es", "en"] as const) {
      const c = julioContent[lang].compliance;
      const text = [...c.now, c.dpa].join(" ").toLowerCase();
      expect(text).not.toMatch(/(iso 27001|iso 27701).{0,20}(certificad|certified)/);
    }
  });

  it("keeps both languages the same shape", () => {
    expect(julioContent.en.roadmap.phases).toHaveLength(julioContent.es.roadmap.phases.length);
    expect(julioContent.en.modules.list).toHaveLength(julioContent.es.modules.list.length);
    expect(julioContent.en.order.steps).toHaveLength(julioContent.es.order.steps.length);
  });
});
