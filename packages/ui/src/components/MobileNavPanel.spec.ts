import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
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
const sheet = (w: VueWrapper) => w.find(".mobile-nav-panel__sheet");
const scrimVisible = (w: VueWrapper) => w.find(".mobile-nav-panel__scrim").classes().includes("mobile-nav-panel__scrim--visible");

// NEO-161 "Kropla": one floating glass box. Collapsed only its bottom row (the
// pill) shows; "More" grows the same box upwards and the pill's buttons become
// the first four modules of the grid. The toggle never leaves its slot.
describe("MobileNavPanel", () => {
  const gridLabels = (w: VueWrapper) => w.findAll(".mobile-nav-panel__grid .mobile-nav-panel__cell").map((c) => c.text());
  const hidden = (w: VueWrapper) => w.findAll(".mobile-nav-panel__grid .mobile-nav-panel__cell").map((c) => c.attributes("inert") !== undefined);

  it("collapsed: the pill shows the first primaryCount modules plus More; the rest wait hidden in the same box", async () => {
    const { wrapper } = await mountPanel();
    // every module lives in the grid, in order — the first four are the pill's buttons
    expect(gridLabels(wrapper)).toEqual(ITEMS.map((i) => i.label));
    expect(wrapper.findAll(".mobile-nav-panel__cell--primary")).toHaveLength(4);
    expect(hidden(wrapper)).toEqual([false, false, false, false, true, true, true]);
    // the row itself only holds the toggle
    expect(wrapper.findAll(".mobile-nav-panel__items .mobile-nav-panel__cell")).toHaveLength(1);
    expect(toggle(wrapper).text()).toContain("More");
    expect(toggle(wrapper).attributes("aria-expanded")).toBe("false");
    expect(toggle(wrapper).attributes("aria-controls")).toBe(sheet(wrapper).attributes("id"));
    // one box: the grid lives inside the nav, above the row, over one glass surface
    expect(wrapper.find(".mobile-nav-panel .mobile-nav-panel__sheet").exists()).toBe(true);
    expect(wrapper.findAll(".mobile-nav-panel__glass")).toHaveLength(1);
    expect(scrimVisible(wrapper)).toBe(false);
  });

  it("More grows the box: the pill's buttons are grid positions 1–4, the toggle stays in its slot as Close", async () => {
    const { wrapper } = await mountPanel();
    const toggleCell = () => wrapper.find(".mobile-nav-panel__items .mobile-nav-panel__cell--toggle");
    expect(toggleCell().find(".mobile-nav-panel__toggle").exists()).toBe(true);
    await toggle(wrapper).trigger("click");
    await flushPromises();
    expect(isExpanded(wrapper)).toBe(true);
    expect(hidden(wrapper).every((h) => !h)).toBe(true);
    expect(gridLabels(wrapper).slice(0, 4)).toEqual(["dashboard", "leads", "hcp", "hco"]);
    expect(scrimVisible(wrapper)).toBe(true);
    expect(toggleCell().find(".mobile-nav-panel__toggle").exists()).toBe(true);
    expect(toggle(wrapper).text()).toContain("Close");
    expect(toggle(wrapper).attributes("aria-expanded")).toBe("true");
  });

  it("animates with CSS only — no script-driven animations", () => {
    const source = readFileSync(path.resolve(__dirname, "MobileNavPanel.vue"), "utf-8");
    expect(source).not.toMatch(/\.animate\(/);
    expect(source).not.toContain("getBoundingClientRect");
  });

  // CORE-119: Chromium drops the backdrop blur of a clip-pathed element.
  it("never clip-paths the blurred glass", () => {
    const source = readFileSync(path.resolve(__dirname, "MobileNavPanel.vue"), "utf-8");
    const glassRules = [...source.matchAll(/[^{}]*\.mobile-nav-panel__glass\s*\{([^}]*)\}/g)].map((m) => m[1]);
    expect(glassRules.length).toBeGreaterThan(0);
    for (const body of glassRules) expect(body).not.toMatch(/clip-path:\s*inset/);
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
    const target = isExpanded(w) ? ".mobile-nav-panel__sheet" : ".mobile-nav-panel__items";
    w.find(target).element.dispatchEvent(new MouseEvent("pointerdown", { clientY: fromY, bubbles: true }));
    for (let y = fromY; fromY < toY ? y <= toY : y >= toY; y += fromY < toY ? 10 : -10) {
      window.dispatchEvent(new MouseEvent("pointermove", { clientY: y }));
    }
    window.dispatchEvent(new MouseEvent("pointermove", { clientY: toY }));
    window.dispatchEvent(new MouseEvent("pointerup", { clientY: toY }));
    await flushPromises();
  }

  it("pulling the collapsed pill up opens the box; a short pull does not", async () => {
    const { wrapper } = await mountPanel();
    await drag(wrapper, 800, 790);
    expect(isExpanded(wrapper)).toBe(false);
    await drag(wrapper, 800, 740);
    expect(isExpanded(wrapper)).toBe(true);
  });

  it("dragging the open box down closes it; a short drag springs back open", async () => {
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
