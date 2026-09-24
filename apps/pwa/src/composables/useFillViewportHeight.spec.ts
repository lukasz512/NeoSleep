import { describe, it, expect, afterEach } from "vitest";
import { defineComponent, h, ref } from "vue";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { useFillViewportHeight } from "./useFillViewportHeight";

/**
 * jsdom does no layout, so the element's top and the ancestors' paddings are
 * stubbed: a VMain-like wrapper (padding-bottom = mobile bottom-nav space)
 * around a card (padding-bottom + border), around the measured element.
 */
function mountAt(top: number, opts: { mainPadding?: number; cardPadding?: number; sectionMargin?: number; minHeight?: number } = {}) {
  let exposed: ReturnType<typeof useFillViewportHeight> | null = null;
  const Harness = defineComponent({
    setup() {
      const target = ref<HTMLElement | null>(null);
      exposed = useFillViewportHeight(target, opts.minHeight);
      return () =>
        h("div", { class: "v-main", style: { paddingBottom: `${opts.mainPadding ?? 0}px` } }, [
          h("div", { style: { paddingBottom: `${opts.cardPadding ?? 0}px`, borderBottom: "1px solid black" } }, [
            // e.g. ItemDetailLayout's .view-item__sections margin-bottom
            h("div", { style: { marginBottom: `${opts.sectionMargin ?? 0}px` } }, [h("div", {
              ref: (el) => {
                const node = el as HTMLElement | null;
                if (node) node.getBoundingClientRect = () => ({ top, bottom: top, left: 0, right: 0, width: 0, height: 0, x: 0, y: top, toJSON: () => ({}) });
                target.value = node;
              },
            })]),
          ]),
        ]);
    },
  });
  const wrapper = mount(Harness, { attachTo: document.body });
  return { wrapper, get api() { return exposed!; } };
}

const wrappers: VueWrapper[] = [];
afterEach(() => {
  for (const w of wrappers.splice(0)) w.unmount();
  window.innerHeight = 768;
});

describe("useFillViewportHeight", () => {
  it("fills from the element's top to the viewport bottom, minus ancestors' bottom padding/border/margin up to VMain", async () => {
    window.innerHeight = 900;
    const { wrapper, api } = mountAt(300, { mainPadding: 64, cardPadding: 24, sectionMargin: 24 });
    wrappers.push(wrapper);
    await flushPromises();
    // 900 - 300 - (24 section margin + 24 card padding + 1 card border + 64 VMain padding)
    expect(api.height.value).toBe(487);
  });

  it("never goes below the minimum height on a short viewport", async () => {
    window.innerHeight = 500;
    const { wrapper, api } = mountAt(300, { minHeight: 360 });
    wrappers.push(wrapper);
    await flushPromises();
    expect(api.height.value).toBe(360);
  });

  it("recomputes on window resize", async () => {
    window.innerHeight = 900;
    const { wrapper, api } = mountAt(100);
    wrappers.push(wrapper);
    await flushPromises();
    expect(api.height.value).toBe(799);

    window.innerHeight = 1100;
    window.dispatchEvent(new Event("resize"));
    expect(api.height.value).toBe(999);
  });
});
