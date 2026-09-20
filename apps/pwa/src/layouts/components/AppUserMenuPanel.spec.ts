import { describe, it, expect, afterEach } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import en from "@i18n/en.json";
import AppUserMenuPanel from "./AppUserMenuPanel.vue";

const mountedWrappers: VueWrapper[] = [];

afterEach(() => {
  for (const w of mountedWrappers.splice(0)) w.unmount();
  document.body.innerHTML = "";
});

function mountPanel(props: { theme: "light" | "dark"; locale: string; drawer?: boolean }) {
  const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
  const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });

  const wrapper = mount(AppUserMenuPanel, {
    props,
    global: { plugins: [i18n, vuetify] },
    attachTo: document.body,
  });
  mountedWrappers.push(wrapper);
  return wrapper;
}

describe("AppUserMenuPanel — NEO-9 icon-based account menu", () => {
  it("renders exactly 3 icon buttons (theme, language, logout), not text rows", () => {
    const wrapper = mountPanel({ theme: "light", locale: "en" });
    expect(wrapper.findAll(".layout-app__user-menu-icon-btn")).toHaveLength(3);
    // No leftover text-row/select markup from the old layout.
    expect(wrapper.find(".v-select").exists()).toBe(false);
  });

  it("theme button shows the interpolated tooltip text as its aria-label and toggles theme on click", async () => {
    const wrapper = mountPanel({ theme: "light", locale: "en" });
    const themeBtn = wrapper.get('[aria-label="Theme: Light. Click for Dark"]');
    await themeBtn.trigger("click");
    expect(wrapper.emitted("toggle-theme")).toHaveLength(1);
    expect(wrapper.emitted("close")).toHaveLength(1);
  });

  it("logout button emits logout and close on click", async () => {
    const wrapper = mountPanel({ theme: "light", locale: "en" });
    const logoutBtn = wrapper.get('[aria-label="Log out"]');
    await logoutBtn.trigger("click");
    expect(wrapper.emitted("logout")).toHaveLength(1);
    expect(wrapper.emitted("close")).toHaveLength(1);
  });

  it("language button opens a menu listing all 3 languages; picking one emits change-locale and close", async () => {
    const wrapper = mountPanel({ theme: "light", locale: "en" });
    const langBtn = wrapper.get('[aria-label="Language"]');
    await langBtn.trigger("click");
    await flushPromises();

    const items = Array.from(document.querySelectorAll(".v-list-item")).map((el) => el.textContent ?? "");
    expect(items).toHaveLength(3);
    expect(items.some((text) => text.includes("Polish"))).toBe(true);
    expect(items.some((text) => text.includes("Spanish"))).toBe(true);
    expect(items.some((text) => text.includes("English"))).toBe(true);

    const plItem = Array.from(document.querySelectorAll(".v-list-item")).find((el) =>
      (el.textContent ?? "").includes("Polish"),
    );
    (plItem as HTMLElement).click();
    await flushPromises();

    expect(wrapper.emitted("change-locale")?.[0]).toEqual(["pl"]);
    expect(wrapper.emitted("close")).toHaveLength(1);
  });

  it("applies the drawer BEM modifier class when the drawer prop is set (mobile usage)", () => {
    const wrapper = mountPanel({ theme: "dark", locale: "en", drawer: true });
    expect(wrapper.find(".layout-app__mobile-drawer-user-menu").exists()).toBe(true);
  });
});
