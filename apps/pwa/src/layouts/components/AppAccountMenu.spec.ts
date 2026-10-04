import { describe, it, expect, afterEach } from "vitest";
import { defineComponent, h, ref } from "vue";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import AppAccountMenu from "./AppAccountMenu.vue";

// The card, motion and swipe are AppGlassPopover's (covered by its own spec);
// this only checks the account menu hands its trigger and content through.

const mounted: VueWrapper[] = [];
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount();
  document.body.innerHTML = "";
});

describe("AppAccountMenu — the avatar's glass card (CORE-4 shares it with the bell)", () => {
  it("opens the shared glass card as the account menu, with its trigger and content", async () => {
    const open = ref(false);
    const Host = defineComponent({
      setup: () => () =>
        h(
          AppAccountMenu,
          { open: open.value, "onUpdate:open": (v: boolean) => (open.value = v), mobile: false, label: "User menu" },
          {
            trigger: ({ open: isOpen }: { open: boolean }) =>
              h("button", { type: "button", "aria-expanded": String(isOpen), "data-testid": "trigger" }, "AL"),
            default: () => h("button", { type: "button", "data-testid": "inside" }, "Log out"),
          },
        ),
    });
    const wrapper = mount(Host, { attachTo: document.body });
    mounted.push(wrapper);

    await wrapper.get('[data-testid="trigger"]').trigger("click");
    await flushPromises();
    const card = document.querySelector<HTMLElement>('[data-testid="account-menu"]');
    expect(card?.getAttribute("aria-label")).toBe("User menu");
    expect(card?.classList.contains("glass-popover__card")).toBe(true);
    expect(card?.querySelector('[data-testid="inside"]')).not.toBeNull();
    expect(wrapper.get('[data-testid="trigger"]').attributes("aria-expanded")).toBe("true");
  });
});
