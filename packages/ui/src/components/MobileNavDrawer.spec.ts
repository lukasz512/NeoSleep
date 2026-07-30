import { describe, it, expect, afterEach } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import MobileNavDrawer from "./MobileNavDrawer.vue";

const mountedWrappers: VueWrapper[] = [];

afterEach(() => {
  for (const w of mountedWrappers.splice(0)) w.unmount();
});

function mountDrawer(modelValue: boolean) {
  const wrapper = mount(MobileNavDrawer, {
    props: { modelValue },
    slots: {
      header: "<div>Header content</div>",
      default: "<div>Nav content</div>",
      footer: "<div>Footer content</div>",
    },
  });
  mountedWrappers.push(wrapper);
  return wrapper;
}

// jsdom has no TouchEvent constructor — @vue/test-utils' trigger() builds a
// plain Event and merges extra properties onto it, which is enough for the
// component's `e.touches[0].clientX` reads.
async function touch(wrapper: VueWrapper, selector: string, type: string, clientX: number) {
  await wrapper.find(selector).trigger(type, { touches: [{ clientX }] });
}

describe("MobileNavDrawer", () => {
  it("renders header, nav, and footer slot content", () => {
    const wrapper = mountDrawer(true);
    expect(wrapper.text()).toContain("Header content");
    expect(wrapper.text()).toContain("Nav content");
    expect(wrapper.text()).toContain("Footer content");
  });

  it("overlay and panel are hidden (v-show) when modelValue is false", () => {
    const wrapper = mountDrawer(false);
    const overlay = wrapper.find(".mobile-nav-drawer__overlay");
    const panel = wrapper.find(".mobile-nav-drawer__panel");
    expect((overlay.element as HTMLElement).style.display).toBe("none");
    expect((panel.element as HTMLElement).style.display).toBe("none");
  });

  it("overlay and panel are visible when modelValue is true", () => {
    const wrapper = mountDrawer(true);
    const overlay = wrapper.find(".mobile-nav-drawer__overlay");
    const panel = wrapper.find(".mobile-nav-drawer__panel");
    expect((overlay.element as HTMLElement).style.display).not.toBe("none");
    expect((panel.element as HTMLElement).style.display).not.toBe("none");
  });

  it("clicking the overlay emits update:modelValue false", async () => {
    const wrapper = mountDrawer(true);
    await wrapper.find(".mobile-nav-drawer__overlay").trigger("click");
    expect(wrapper.emitted("update:modelValue")?.[0]).toEqual([false]);
  });

  it("swiping the panel left past the close threshold emits update:modelValue false", async () => {
    const wrapper = mountDrawer(true);
    const sel = ".mobile-nav-drawer__panel";

    await touch(wrapper, sel, "touchstart", 200);
    await touch(wrapper, sel, "touchmove", 100); // delta -100, past -72 threshold
    await touch(wrapper, sel, "touchend", 100);

    expect(wrapper.emitted("update:modelValue")?.[0]).toEqual([false]);
  });

  it("swiping left but not past the threshold does not close the drawer", async () => {
    const wrapper = mountDrawer(true);
    const sel = ".mobile-nav-drawer__panel";

    await touch(wrapper, sel, "touchstart", 200);
    await touch(wrapper, sel, "touchmove", 160); // delta -40, within threshold
    await touch(wrapper, sel, "touchend", 160);

    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
  });

  it("swiping right (into the panel) does not move or close it", async () => {
    const wrapper = mountDrawer(true);
    const sel = ".mobile-nav-drawer__panel";

    await touch(wrapper, sel, "touchstart", 100);
    await touch(wrapper, sel, "touchmove", 250); // positive delta, ignored
    await touch(wrapper, sel, "touchend", 250);

    const panel = wrapper.find(sel).element as HTMLElement;
    expect(panel.style.transform).toBe("");
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
  });
});
