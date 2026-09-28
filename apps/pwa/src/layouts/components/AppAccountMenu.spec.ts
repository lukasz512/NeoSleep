import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { defineComponent, h, ref } from "vue";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import AppAccountMenu from "./AppAccountMenu.vue";

// jsdom has no layout (and no Element.animate), so the CSS motion is skipped — these
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

  it("on phones shows a swipe handle at the bottom of the card; desktop has none", async () => {
    const phone = mountMenu(true);
    await phone.wrapper.get('[data-testid="trigger"]').trigger("click");
    await flushPromises();
    expect(document.querySelector('[data-testid="account-menu-handle"]')).not.toBeNull();
    phone.wrapper.unmount();
    document.body.innerHTML = "";

    const desktop = mountMenu(false);
    await desktop.wrapper.get('[data-testid="trigger"]').trigger("click");
    await flushPromises();
    expect(dialog()).not.toBeNull();
    expect(document.querySelector('[data-testid="account-menu-handle"]')).toBeNull();
  });

  describe("swipe up to close (phone)", () => {
    function pointer(target: EventTarget, type: string, clientY: number, timeStamp = 0) {
      const e = new MouseEvent(type, { clientY, clientX: 100, button: 0, bubbles: true });
      Object.defineProperty(e, "pointerId", { value: 1 });
      Object.defineProperty(e, "timeStamp", { value: timeStamp });
      target.dispatchEvent(e);
    }

    async function openPhone() {
      const menu = mountMenu(true);
      await menu.wrapper.get('[data-testid="trigger"]').trigger("click");
      await flushPromises();
      return menu;
    }

    it("closes when the card is dragged up far enough", async () => {
      const { open } = await openPhone();
      pointer(dialog()!, "pointerdown", 300, 0);
      pointer(window, "pointermove", 260, 200);
      pointer(window, "pointermove", 200, 400);
      pointer(window, "pointerup", 200, 400);
      await flushPromises();
      expect(open.value).toBe(false);
    });

    it("springs back and stays open after a short, slow drag", async () => {
      const { open } = await openPhone();
      pointer(dialog()!, "pointerdown", 300, 0);
      pointer(window, "pointermove", 280, 300);
      expect(dialog()!.style.transform).toBe("translateY(-20px)");
      pointer(window, "pointerup", 280, 600);
      await flushPromises();
      expect(open.value).toBe(true);
      expect(dialog()!.style.transform).toBe("");
    });

    it("a drag doesn't press the button it started on", async () => {
      await openPhone();
      const inside = document.querySelector<HTMLElement>('[data-testid="inside"]')!;
      let clicked = false;
      inside.addEventListener("click", () => (clicked = true));
      pointer(inside, "pointerdown", 300, 0);
      pointer(window, "pointermove", 280, 300);
      pointer(window, "pointerup", 280, 600);
      inside.click();
      expect(clicked).toBe(false);
    });
  });

  // NEO-161: the motion is CSS on a class — no script animation, no SVG filter.
  it("opens by adding a class the CSS transitions on, with no script-driven animation", async () => {
    const { wrapper } = mountMenu(true);
    await wrapper.get('[data-testid="trigger"]').trigger("click");
    await flushPromises();
    expect(document.querySelector(".account-menu--open")).not.toBeNull();
    const dir = path.resolve(__dirname);
    const component = readFileSync(path.join(dir, "AppAccountMenu.vue"), "utf-8");
    const motion = readFileSync(path.resolve(dir, "../../composables/useAccountMenuMotion.ts"), "utf-8");
    for (const source of [component, motion]) {
      expect(source).not.toMatch(/\.animate\(/);
      expect(source).not.toContain("feGaussianBlur");
    }
  });
});
