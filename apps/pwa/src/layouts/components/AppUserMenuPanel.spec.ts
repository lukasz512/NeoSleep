import { describe, it, expect, afterEach } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import en from "@i18n/en.json";
import type { ThemePreference } from "@stores";
import AppUserMenuPanel from "./AppUserMenuPanel.vue";

const mountedWrappers: VueWrapper[] = [];

afterEach(() => {
  for (const w of mountedWrappers.splice(0)) w.unmount();
  document.body.innerHTML = "";
});

function mountPanel(overrides: Partial<{
  themePreference: ThemePreference;
  canChangePassword: boolean;
  channel: string | null;
  version: string;
  sheet: boolean;
}> = {}) {
  const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
  const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });

  const wrapper = mount(AppUserMenuPanel, {
    props: {
      name: "Ana López",
      email: "ana.lopez@clinic.mx",
      roleLabel: "Administrator",
      initials: "AL",
      region: "MX",
      themePreference: "system",
      locale: "en",
      canChangePassword: true,
      version: "Version 1.0.0 (build 105)",
      channel: "DEV",
      ...overrides,
    },
    global: { plugins: [i18n, vuetify] },
    attachTo: document.body,
  });
  mountedWrappers.push(wrapper);
  return wrapper;
}

function segmentTabs(wrapper: VueWrapper, testid: string) {
  return wrapper.get(`[data-testid="${testid}"]`).findAll('[role="tab"]');
}

describe("AppUserMenuPanel — NEO-102 account menu (option C)", () => {
  it("shows who is signed in: name, email, role and region", () => {
    const text = mountPanel().text();
    expect(text).toContain("Ana López");
    expect(text).toContain("ana.lopez@clinic.mx");
    expect(text).toContain("Administrator");
    expect(text).toContain("MX");
  });

  it("theme is a Light / Dark / Auto segment with the current preference selected", () => {
    const tabs = segmentTabs(mountPanel({ themePreference: "system" }), "user-menu-theme");
    expect(tabs.map((t) => t.text())).toEqual(["Light", "Dark", "Auto"]);
    expect(tabs[2]!.attributes("aria-selected")).toBe("true");
  });

  it("picking a theme emits set-theme and keeps the menu open", async () => {
    const wrapper = mountPanel();
    await segmentTabs(wrapper, "user-menu-theme")[1]!.trigger("click");
    expect(wrapper.emitted("set-theme")?.[0]).toEqual(["dark"]);
    expect(wrapper.emitted("close")).toBeUndefined();
  });

  it("language is a one-tap segment in each language's own name; picking one emits change-locale and close", async () => {
    const wrapper = mountPanel();
    const tabs = segmentTabs(wrapper, "user-menu-language");
    expect(tabs.map((t) => t.text())).toEqual(["English", "Polski", "Español (MX)"]);
    expect(tabs[0]!.attributes("aria-selected")).toBe("true");
    await tabs[1]!.trigger("click");
    expect(wrapper.emitted("change-locale")?.[0]).toEqual(["pl"]);
    expect(wrapper.emitted("close")).toHaveLength(1);
  });

  it("offers Change password only to accounts that have a password", async () => {
    const withPassword = mountPanel({ canChangePassword: true });
    await withPassword.get('[data-testid="user-menu-change-password"]').trigger("click");
    expect(withPassword.emitted("change-password")).toHaveLength(1);
    expect(withPassword.emitted("close")).toHaveLength(1);

    const googleOnly = mountPanel({ canChangePassword: false });
    expect(googleOnly.find('[data-testid="user-menu-change-password"]').exists()).toBe(false);
  });

  it("log out is its own button and emits logout and close", async () => {
    const wrapper = mountPanel();
    const logout = wrapper.get('[data-testid="user-menu-logout"]');
    expect(logout.text()).toContain("Log out");
    await logout.trigger("click");
    expect(wrapper.emitted("logout")).toHaveLength(1);
    expect(wrapper.emitted("close")).toHaveLength(1);
  });

  it("ends with the app version, plus the channel tag on non-prod builds only", () => {
    const dev = mountPanel().get('[data-testid="user-menu-version"]');
    expect(dev.text()).toContain("Version 1.0.0 (build 105)");
    expect(dev.text()).toContain("DEV");

    const prod = mountPanel({ channel: null }).get('[data-testid="user-menu-version"]');
    expect(prod.text()).not.toContain("DEV");

    expect(mountPanel({ version: "" }).find('[data-testid="user-menu-version"]').exists()).toBe(false);
  });

  it("uses the full-width bottom-sheet look on phones", () => {
    expect(mountPanel({ sheet: true }).find(".user-menu--sheet").exists()).toBe(true);
    expect(mountPanel({ sheet: false }).find(".user-menu--sheet").exists()).toBe(false);
  });
});
