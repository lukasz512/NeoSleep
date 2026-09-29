import { describe, it, expect, afterEach } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { createRouter, createMemoryHistory, type Router } from "vue-router";
import MobileBottomNavItem from "./MobileBottomNavItem.vue";

const STUB_ROUTE = { template: "<div/>" };

function createTestRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", component: STUB_ROUTE },
      { path: "/contact", component: STUB_ROUTE },
    ],
  });
}

const mountedWrappers: VueWrapper[] = [];

afterEach(() => {
  for (const w of mountedWrappers.splice(0)) w.unmount();
});

async function mountItem(
  props: { to: string; label: string; showLabel?: boolean },
  path = "/",
) {
  const router = createTestRouter();
  await router.push(path);
  await router.isReady();

  const wrapper = mount(MobileBottomNavItem, {
    props,
    slots: { default: "<svg data-test-icon />" },
    global: { plugins: [router] },
  });
  mountedWrappers.push(wrapper);
  return { wrapper, router };
}

describe("MobileBottomNavItem", () => {
  it("renders the icon slot and label text, label hidden by default", async () => {
    const { wrapper } = await mountItem({ to: "/contact", label: "Contact" });
    expect(wrapper.find("[data-test-icon]").exists()).toBe(true);
    expect(wrapper.text()).toContain("Contact");
    expect(wrapper.find(".mobile-bottom-nav-item").classes()).not.toContain("mobile-bottom-nav-item--label");
    // Label hidden visually → falls back to aria-label for accessibility.
    expect(wrapper.find(".mobile-bottom-nav-item").attributes("aria-label")).toBe("Contact");
  });

  it("shows the label and drops the redundant aria-label when showLabel is true", async () => {
    const { wrapper } = await mountItem({ to: "/contact", label: "Contact", showLabel: true });
    expect(wrapper.find(".mobile-bottom-nav-item").classes()).toContain("mobile-bottom-nav-item--label");
    expect(wrapper.find(".mobile-bottom-nav-item").attributes("aria-label")).toBeUndefined();
  });

  it("marks the item active when its route matches the current path", async () => {
    const { wrapper } = await mountItem({ to: "/contact", label: "Contact" }, "/contact");
    expect(wrapper.find(".mobile-bottom-nav-item").classes()).toContain("mobile-bottom-nav-item--active");
  });

  it("navigates on click by default", async () => {
    const { wrapper, router } = await mountItem({ to: "/contact", label: "Contact" }, "/");
    await wrapper.find(".mobile-bottom-nav-item").trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.path).toBe("/contact");
  });

  it("emits click, and calling preventDefault() in a listener blocks navigation", async () => {
    const router = createTestRouter();
    await router.push("/");
    await router.isReady();

    const wrapper = mount(MobileBottomNavItem, {
      props: { to: "/contact", label: "Contact" },
      // preventDefault() here mirrors apps/web's "already active → scroll
      // instead of navigate" override.
      attrs: { onClick: (e: MouseEvent) => e.preventDefault() },
      slots: { default: "<svg data-test-icon />" },
      global: { plugins: [router] },
    });
    mountedWrappers.push(wrapper);

    await wrapper.find(".mobile-bottom-nav-item").trigger("click");
    expect(wrapper.emitted("click")).toHaveLength(1);
    expect(router.currentRoute.value.path).toBe("/");
  });

  // NEO-55: apps/pwa's "More" tab — same look, but a button that opens a sheet.
  describe("without `to` (action item)", () => {
    async function mountAction(props: { label: string; active?: boolean; expanded?: boolean }) {
      const router = createTestRouter();
      await router.push("/");
      await router.isReady();
      const wrapper = mount(MobileBottomNavItem, {
        props: { ...props, showLabel: true },
        slots: { default: "<svg data-test-icon />" },
        global: { plugins: [router] },
      });
      mountedWrappers.push(wrapper);
      return { wrapper, router };
    }

    it("renders a real button, not a link, and emits click without navigating", async () => {
      const { wrapper, router } = await mountAction({ label: "More" });
      const item = wrapper.find(".mobile-bottom-nav-item");
      expect(item.element.tagName).toBe("BUTTON");
      expect(item.attributes("type")).toBe("button");
      expect(item.attributes("href")).toBeUndefined();
      await item.trigger("click");
      expect(wrapper.emitted("click")).toHaveLength(1);
      expect(router.currentRoute.value.path).toBe("/");
    });

    it("takes its active state and aria-expanded from props", async () => {
      const { wrapper } = await mountAction({ label: "More", active: true, expanded: true });
      const item = wrapper.find(".mobile-bottom-nav-item");
      expect(item.classes()).toContain("mobile-bottom-nav-item--active");
      expect(item.attributes("aria-expanded")).toBe("true");
    });

    it("is not active by default", async () => {
      const { wrapper } = await mountAction({ label: "More" });
      expect(wrapper.find(".mobile-bottom-nav-item").classes()).not.toContain("mobile-bottom-nav-item--active");
    });
  });
});
