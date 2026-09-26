import { describe, it, expect } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";
import { mount } from "@vue/test-utils";
import { useBarLogoFit, BAR_LOGO_MIN_GAP } from "./useBarLogoFit";
import BrandWordmarkFold from "../../../../packages/ui/src/components/BrandWordmarkFold.vue";

/** An element whose left edge is fixed at `left` (jsdom has no layout). */
function at(left: number): HTMLElement {
  const el = document.createElement("div");
  el.getBoundingClientRect = () => ({ left, right: left, top: 0, bottom: 0, width: 0, height: 0, x: left, y: 0, toJSON: () => ({}) });
  return el;
}

function run(logoLeft: number, actionsLeft: number, width: number, enabled = true) {
  let result: ReturnType<typeof useBarLogoFit> | undefined;
  mount(
    defineComponent({
      setup() {
        result = useBarLogoFit(ref(at(logoLeft)), ref(at(actionsLeft)), ref(width), ref(enabled));
        return () => h("div");
      },
    }),
  );
  return result!;
}

describe("useBarLogoFit (NEO-108)", () => {
  it("keeps the wordmark while it fits next to the icons", async () => {
    const { folded } = run(8, 8 + 107 + BAR_LOGO_MIN_GAP, 107);
    await nextTick();
    expect(folded.value).toBe(false);
  });

  it("folds once the icons leave less room than the wordmark plus the gap", async () => {
    const { folded } = run(8, 8 + 107 + BAR_LOGO_MIN_GAP - 1, 107);
    await nextTick();
    expect(folded.value).toBe(true);
  });

  it("never folds when disabled (desktop)", async () => {
    const { folded } = run(8, 20, 107, false);
    await nextTick();
    expect(folded.value).toBe(false);
  });
});

describe("BrandWordmarkFold (NEO-108)", () => {
  it("folds the O to exactly markSize and scales it from the wordmark height", () => {
    const wrapper = mount(BrandWordmarkFold, { props: { height: 18, markSize: 32, folded: true } });
    const root = wrapper.get(".brand-wordmark-fold");
    expect(root.classes()).toContain("brand-wordmark-fold--folded");
    const style = root.attributes("style") ?? "";
    expect(style).toContain("--bwf-folded-width: 32px");
    expect(style).toContain("--bwf-width: 107.2px");
    // 32px / (71 units × 18/90 px per unit)
    expect(style).toContain(`--bwf-mark-scale: ${32 / (71 * (18 / 90))}`);
    expect(root.attributes("aria-label")).toBe("NeoSleep");
  });

  it("stays unfolded by default, with NE, the O mark and SLEEP as separate groups", () => {
    const wrapper = mount(BrandWordmarkFold);
    expect(wrapper.get(".brand-wordmark-fold").classes()).not.toContain("brand-wordmark-fold--folded");
    for (const part of ["ne", "mark", "sleep"]) expect(wrapper.find(`.brand-wordmark-fold__${part}`).exists()).toBe(true);
  });
});
