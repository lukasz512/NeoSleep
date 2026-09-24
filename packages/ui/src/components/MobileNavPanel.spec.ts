import { describe, it, expect, afterEach } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { createRouter, createMemoryHistory } from "vue-router";
import MobileNavPanel from "./MobileNavPanel.vue";

const STUB = { template: "<div/>" };
const ITEMS = ["dashboard", "leads", "hcp", "hco", "patients", "planner", "resources"].map((name) => ({
  path: `/${name}`,
  label: name,
  name,
}));

const mounted: VueWrapper[] = [];
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount();
});

async function mountPanel(path = "/dashboard") {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/", component: STUB }, ...ITEMS.map((i) => ({ path: i.path, component: STUB })), { path: "/patients/:id", component: STUB }],
  });
  await router.push(path);
  await router.isReady();
  const wrapper = mount(MobileNavPanel, {
    props: { items: ITEMS, primaryCount: 4, showLabels: true, moreLabel: "More", closeLabel: "Close" },
    slots: { icon: "<svg data-test-icon />" },
    global: { plugins: [router] },
    attachTo: document.body,
  });
  mounted.push(wrapper);
  return { wrapper, router };
}

const toggle = (w: VueWrapper) => w.find(".mobile-nav-panel__toggle");
const isExpanded = (w: VueWrapper) => w.find(".mobile-nav-panel").classes().includes("mobile-nav-panel--expanded");

// NEO-55: the bottom bar expands in place into a grid of every module.
describe("MobileNavPanel", () => {
  it("collapsed: every item is rendered once, those past primaryCount marked overflow, plus a More toggle", async () => {
    const { wrapper } = await mountPanel();
    const cells = wrapper.findAll(".mobile-nav-panel__cell");
    expect(cells).toHaveLength(ITEMS.length + 1);
    expect(wrapper.findAll(".mobile-nav-panel__cell--overflow")).toHaveLength(3);
    expect(toggle(wrapper).text()).toContain("More");
    expect(toggle(wrapper).attributes("aria-expanded")).toBe("false");
    expect(wrapper.find(".mobile-nav-panel__scrim").exists()).toBe(false);
  });

  it("More expands the same cells into the grid, shows the scrim, and turns into Close", async () => {
    const { wrapper } = await mountPanel();
    await toggle(wrapper).trigger("click");
    await flushPromises();
    expect(isExpanded(wrapper)).toBe(true);
    expect(wrapper.find(".mobile-nav-panel__scrim").exists()).toBe(true);
    expect(wrapper.find(".mobile-nav-panel__handle").exists()).toBe(true);
    expect(toggle(wrapper).text()).toContain("Close");
    expect(toggle(wrapper).attributes("aria-expanded")).toBe("true");
    // No separate list: still exactly one cell per item + the toggle.
    expect(wrapper.findAll(".mobile-nav-panel__cell")).toHaveLength(ITEMS.length + 1);
  });

  it("closes from the Close toggle, the scrim, Escape, and any navigation", async () => {
    const { wrapper, router } = await mountPanel();
    const open = async () => {
      await toggle(wrapper).trigger("click");
      await flushPromises();
      expect(isExpanded(wrapper)).toBe(true);
    };

    await open();
    await toggle(wrapper).trigger("click");
    await flushPromises();
    expect(isExpanded(wrapper)).toBe(false);

    await open();
    await wrapper.find(".mobile-nav-panel__scrim").trigger("click");
    await flushPromises();
    expect(isExpanded(wrapper)).toBe(false);

    await open();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await flushPromises();
    expect(isExpanded(wrapper)).toBe(false);

    await open();
    await router.push("/planner");
    await flushPromises();
    expect(isExpanded(wrapper)).toBe(false);
  });

  // jsdom has no PointerEvent constructor; a MouseEvent of the same type
  // carries clientY and reaches the same listeners.
  async function drag(w: VueWrapper, fromY: number, toY: number) {
    w.find(".mobile-nav-panel").element.dispatchEvent(new MouseEvent("pointerdown", { clientY: fromY, bubbles: true }));
    for (let y = fromY; fromY < toY ? y <= toY : y >= toY; y += fromY < toY ? 10 : -10) {
      window.dispatchEvent(new MouseEvent("pointermove", { clientY: y }));
    }
    window.dispatchEvent(new MouseEvent("pointermove", { clientY: toY }));
    window.dispatchEvent(new MouseEvent("pointerup", { clientY: toY }));
    await flushPromises();
  }

  it("pulling the collapsed bar up opens the grid; a short pull does not", async () => {
    const { wrapper } = await mountPanel();
    await drag(wrapper, 800, 790);
    expect(isExpanded(wrapper)).toBe(false);
    await drag(wrapper, 800, 740);
    expect(isExpanded(wrapper)).toBe(true);
  });

  it("dragging the open grid down closes it; a short drag springs back open", async () => {
    const { wrapper } = await mountPanel();
    await toggle(wrapper).trigger("click");
    await flushPromises();
    await drag(wrapper, 500, 540);
    expect(isExpanded(wrapper)).toBe(true);
    await drag(wrapper, 500, 620);
    expect(isExpanded(wrapper)).toBe(false);
  });

  it("More reads as active while inside an overflow module (list or detail), not otherwise", async () => {
    const onOverflow = await mountPanel("/patients/42");
    expect(toggle(onOverflow.wrapper).classes()).toContain("mobile-bottom-nav-item--active");
    const onPrimary = await mountPanel("/leads");
    expect(toggle(onPrimary.wrapper).classes()).not.toContain("mobile-bottom-nav-item--active");
  });

  it("has no More toggle when every item fits the bar", async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/", component: STUB }] });
    await router.push("/");
    await router.isReady();
    const wrapper = mount(MobileNavPanel, {
      props: { items: ITEMS.slice(0, 3), primaryCount: 4 },
      global: { plugins: [router] },
    });
    mounted.push(wrapper);
    expect(wrapper.find(".mobile-nav-panel__toggle").exists()).toBe(false);
  });
});
