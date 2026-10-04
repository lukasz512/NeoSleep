import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createPinia } from "pinia";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import AppAccountButton from "./AppAccountButton.vue";

const SOURCE = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "AppAccountButton.vue"), "utf-8");
const mountedWrappers: VueWrapper[] = [];

afterEach(() => {
  for (const w of mountedWrappers.splice(0)) w.unmount();
});

function mountButton(props: Partial<{ compact: boolean; expanded: boolean; role: string | null }> = {}) {
  const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });
  const wrapper = mount(AppAccountButton, {
    props: { name: "Ana López", roleLabel: "Admin", role: "admin", label: "User menu", ...props },
    global: { plugins: [vuetify, createPinia()] },
  });
  mountedWrappers.push(wrapper);
  return wrapper;
}

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return SOURCE.match(new RegExp(`(^|\\n)${escaped}\\s*\\{[\\s\\S]*?\\}`))?.[0] ?? "";
}

describe("AppAccountButton (CORE-131)", () => {
  it("shows name, role and the avatar with its role badge, carrying the menu motion marks", () => {
    const w = mountButton();
    expect(w.find(".layout-user-name").text()).toBe("Ana López");
    expect(w.find(".layout-user-role").text()).toBe("Admin");
    expect(w.find('[data-motion="trigger-avatar"]').exists()).toBe(true);
    expect(w.find('[data-motion="trigger-name"]').exists()).toBe(true);
    expect(w.find("[data-testid=app-avatar-role-badge]").exists()).toBe(true);
  });

  it("compact (phone) shows the avatar only", () => {
    const w = mountButton({ compact: true });
    expect(w.find(".layout-user-info").exists()).toBe(false);
    expect(w.classes()).toContain("layout-user-btn--compact");
  });

  it("exposes the menu state and label to assistive tech", () => {
    const w = mountButton({ expanded: true });
    expect(w.attributes("aria-expanded")).toBe("true");
    expect(w.attributes("aria-haspopup")).toBe("dialog");
    expect(w.attributes("aria-label")).toBe("User menu");
  });

  it("the account button does not clip the avatar badge", () => {
    // VBtn sets overflow: hidden, which cut the badge off at the avatar's corner.
    expect(rule(".layout-user-btn")).toMatch(/overflow:\s*visible\s*!important/);
  });

  it("keyboard focus is variant C: tinted pill + ring on the avatar, no outline around the pill", () => {
    const focus = rule(".layout-user-btn:focus-visible");
    expect(focus).toMatch(/outline:\s*none/);
    expect(focus).toMatch(/background-color:\s*rgba\(var\(--v-theme-primary\)/);
    expect(rule(".layout-user-avatar::after")).toMatch(/opacity:\s*0/);
    expect(rule(".layout-user-btn:focus-visible .layout-user-avatar::after")).toMatch(/opacity:\s*1/);
    // Only on :focus-visible — a mouse click or tap never shows the ring.
    expect(SOURCE).not.toMatch(/\.layout-user-btn:focus(?!-visible)/);
  });

  it("turns the focus motion off for reduced motion", () => {
    expect(SOURCE).toMatch(/prefers-reduced-motion:\s*reduce[\s\S]*?transition:\s*none/);
  });
});
