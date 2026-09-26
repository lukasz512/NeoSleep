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

function choices(wrapper: VueWrapper, testid: string) {
  return wrapper.get(`[data-testid="${testid}"]`).findAll('[role="radio"]');
}

describe("AppUserMenuPanel — NEO-102 account menu (icon rows + action pair)", () => {
  it("shows who is signed in: name, email, role and region", () => {
    const text = mountPanel().text();
    expect(text).toContain("Ana López");
    expect(text).toContain("ana.lopez@clinic.mx");
    expect(text).toContain("Administrator");
    expect(text).toContain("MX");
  });

  it("theme is three icons (Light / Dark / Auto), named for screen readers, the current one checked", () => {
    const options = choices(mountPanel({ themePreference: "system" }), "user-menu-theme");
    expect(options.map((o) => o.attributes("aria-label"))).toEqual(["Light", "Dark", "Auto"]);
    expect(options.every((o) => o.find("svg.app-icon").exists())).toBe(true);
    expect(options.map((o) => o.attributes("aria-checked"))).toEqual(["false", "false", "true"]);
  });

  it("picking a theme emits set-theme and keeps the menu open", async () => {
    const wrapper = mountPanel();
    await choices(wrapper, "user-menu-theme")[1]!.trigger("click");
    expect(wrapper.emitted("set-theme")?.[0]).toEqual(["dark"]);
    expect(wrapper.emitted("close")).toBeUndefined();
  });

  it("language is three flags (SVG, not emoji) named in each language's own name; picking one emits change-locale and close", async () => {
    const wrapper = mountPanel();
    const options = choices(wrapper, "user-menu-language");
    expect(options.map((o) => o.attributes("aria-label"))).toEqual(["English", "Polski", "Español (MX)"]);
    expect(options.every((o) => o.find("svg.app-flag").exists())).toBe(true);
    expect(options[0]!.attributes("aria-checked")).toBe("true");
    await options[1]!.trigger("click");
    expect(wrapper.emitted("change-locale")?.[0]).toEqual(["pl"]);
    expect(wrapper.emitted("close")).toHaveLength(1);
  });

  it("password and log out are a matching pair of buttons", async () => {
    const wrapper = mountPanel({ canChangePassword: true });
    const password = wrapper.get('[data-testid="user-menu-change-password"]');
    const logout = wrapper.get('[data-testid="user-menu-logout"]');
    expect(password.classes()).toContain("user-menu__action");
    expect(logout.classes()).toContain("user-menu__action");
    expect(password.text()).toBe("Password");
    expect(password.attributes("aria-label")).toBe("Change password");
    expect(logout.text()).toContain("Log out");

    await password.trigger("click");
    expect(wrapper.emitted("change-password")).toHaveLength(1);
    await logout.trigger("click");
    expect(wrapper.emitted("logout")).toHaveLength(1);
    expect(wrapper.emitted("close")).toHaveLength(2);
  });

  it("a Google-only account gets no password button, and log out spans the row", () => {
    const wrapper = mountPanel({ canChangePassword: false });
    expect(wrapper.find('[data-testid="user-menu-change-password"]').exists()).toBe(false);
    expect(wrapper.find(".user-menu__actions--single").exists()).toBe(true);
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
