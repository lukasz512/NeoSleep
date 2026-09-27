import { describe, it, expect, afterEach } from "vitest";
import { defineComponent, h, ref } from "vue";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import AppAccountMenu from "./AppAccountMenu.vue";

// jsdom has no Element.animate, so the motion takes its instant path — these
// tests cover behaviour (open, close, focus, accessibility), not the animation.

const mounted: VueWrapper[] = [];
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount();
  document.body.innerHTML = "";
});

function mountMenu(mobile = false) {
  const open = ref(false);
  const Host = defineComponent({
    setup() {
      return () =>
        h(
          AppAccountMenu,
          { open: open.value, "onUpdate:open": (v: boolean) => (open.value = v), mobile, label: "User menu" },
          {
            trigger: ({ open: isOpen }: { open: boolean }) =>
              h("button", { type: "button", "aria-expanded": String(isOpen), "data-testid": "trigger" }, [
                h("span", { "data-motion": "trigger-name" }, "Ana López"),
                h("span", { "data-motion": "trigger-avatar" }, "AL"),
              ]),
            default: () =>
              h("div", { class: "panel" }, [
                h("div", {}, [
                  h("span", { "data-motion": "name" }, "Ana López"),
                  h("span", { "data-motion": "avatar" }, "AL"),
                ]),
                h("div", { "data-motion": "row" }, "Theme"),
                h("button", { type: "button", "data-testid": "inside" }, "Log out"),
              ]),
          },
        );
    },
  });
  const wrapper = mount(Host, { attachTo: document.body });
  mounted.push(wrapper);
  return { wrapper, open };
}

const dialog = () => document.querySelector<HTMLElement>('[data-testid="account-menu"]');

describe("AppAccountMenu — NEO-122 avatar button turns into the menu", () => {
  it("opens as a named dialog when the avatar button is clicked, and marks the button expanded", async () => {
    const { wrapper } = mountMenu();
    expect(dialog()).toBeNull();
    await wrapper.get('[data-testid="trigger"]').trigger("click");
    await flushPromises();
    expect(dialog()?.getAttribute("role")).toBe("dialog");
    expect(dialog()?.getAttribute("aria-label")).toBe("User menu");
    expect(wrapper.get('[data-testid="trigger"]').attributes("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(dialog());
  });

  it("hides the button while the menu stands in its place, so the name shows once", async () => {
    const { wrapper } = mountMenu();
    await wrapper.get('[data-testid="trigger"]').trigger("click");
    await flushPromises();
    expect(wrapper.find(".account-menu__trigger--hidden").exists()).toBe(true);
  });

  it("closes on Escape and gives focus back to the avatar button", async () => {
    const { wrapper, open } = mountMenu();
    await wrapper.get('[data-testid="trigger"]').trigger("click");
    await flushPromises();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await flushPromises();
    expect(open.value).toBe(false);
    expect(dialog()).toBeNull();
    expect(wrapper.find(".account-menu__trigger--hidden").exists()).toBe(false);
    expect(document.activeElement).toBe(wrapper.get('[data-testid="trigger"]').element);
  });

  it("closes on a click outside the card, but not on a click inside it", async () => {
    const { wrapper, open } = mountMenu();
    await wrapper.get('[data-testid="trigger"]').trigger("click");
    await flushPromises();
    document.querySelector<HTMLElement>('[data-testid="inside"]')!.click();
    await flushPromises();
    expect(open.value).toBe(true);
    document.querySelector<HTMLElement>('[data-testid="account-menu-dim"]')!.click();
    await flushPromises();
    expect(open.value).toBe(false);
  });

  // NEO-154: phone and desktop open the same card; the phone one sits above the bottom nav.
  it("on phones opens the same card as on desktop, above the bottom nav bar", async () => {
    const { wrapper } = mountMenu(true);
    await wrapper.get('[data-testid="trigger"]').trigger("click");
    await flushPromises();
    expect(dialog()?.classList.contains("account-menu__card")).toBe(true);
    expect(document.querySelector(".account-menu--phone")).not.toBeNull();
    expect(document.querySelector(".account-menu__sheet")).toBeNull();
  });
});
