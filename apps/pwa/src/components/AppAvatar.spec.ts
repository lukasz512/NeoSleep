import { describe, it, expect, afterEach } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import AppAvatar from "./AppAvatar.vue";
import AppIcon from "./AppIcon.vue";

// A named type import from a .vue file only resolves through this app's "*.vue"
// ambient shim's default export — same InstanceType introspection formField.ts/
// entityActions.ts already use for AppIconName.
type AppAvatarEntityType = InstanceType<typeof AppAvatar>["$props"]["entityType"];

const mountedWrappers: VueWrapper[] = [];

afterEach(() => {
  for (const w of mountedWrappers.splice(0)) w.unmount();
});

function mountAvatar(props: { entityType: AppAvatarEntityType; orgType?: string; name?: string; avatarUrl?: string; size?: number }) {
  const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });
  const wrapper = mount(AppAvatar, { props, global: { plugins: [vuetify] } });
  mountedWrappers.push(wrapper);
  return wrapper;
}

describe("AppAvatar (hco entity type)", () => {
  it("renders the unchanged clinic icon when orgType is clinic or missing", () => {
    expect(mountAvatar({ entityType: "hco", orgType: "clinic" }).findComponent(AppIcon).props("name")).toBe("nav-hco");
    expect(mountAvatar({ entityType: "hco" }).findComponent(AppIcon).props("name")).toBe("nav-hco");
  });

  it("renders a distinct icon per organization type", () => {
    expect(mountAvatar({ entityType: "hco", orgType: "hospital" }).findComponent(AppIcon).props("name")).toBe("hco-hospital");
    expect(mountAvatar({ entityType: "hco", orgType: "pharmacy" }).findComponent(AppIcon).props("name")).toBe("hco-pharmacy");
    expect(mountAvatar({ entityType: "hco", orgType: "practice" }).findComponent(AppIcon).props("name")).toBe("hco-practice");
    expect(mountAvatar({ entityType: "hco", orgType: "other" }).findComponent(AppIcon).props("name")).toBe("hco-other");
  });

  it("falls back to the clinic icon for an unrecognized org type, no crash", () => {
    expect(mountAvatar({ entityType: "hco", orgType: "something_new" }).findComponent(AppIcon).props("name")).toBe("nav-hco");
  });

  it("ignores orgType for non-hco entity types", () => {
    expect(mountAvatar({ entityType: "hcp", orgType: "hospital" }).findComponent(AppIcon).props("name")).toBe("nav-hcp");
  });

  it("renders the icon, not letter initials, even when a name is passed", () => {
    const wrapper = mountAvatar({ entityType: "hco", name: "Clinica Dra. Laura Cuicas" });
    expect(wrapper.find(".app-avatar__initials").exists()).toBe(false);
    expect(wrapper.findComponent(AppIcon).props("name")).toBe("nav-hco");
  });
});

describe("AppAvatar (non-hco entity types)", () => {
  it("still renders initials from a name, unaffected by the hco fix", () => {
    const wrapper = mountAvatar({ entityType: "hcp", name: "Jan Kowalski" });
    expect(wrapper.find(".app-avatar__initials").text()).toBe("JK");
  });
});

describe("AppAvatar (identity tint, NEO-57)", () => {
  it("tints each identity type with its own tone class", () => {
    expect(mountAvatar({ entityType: "patient", name: "Mateusz Dotestowania" }).classes()).toContain("app-avatar--patient");
    expect(mountAvatar({ entityType: "hcp", name: "Jan Kowalski" }).classes()).toContain("app-avatar--doctor");
    expect(mountAvatar({ entityType: "hco" }).classes()).toContain("app-avatar--org");
    expect(mountAvatar({ entityType: "user", name: "Anna Nowak" }).classes()).toContain("app-avatar--person");
    expect(mountAvatar({ entityType: "lead", name: "Anna Nowak" }).classes()).toContain("app-avatar--person");
  });

  it("keeps initials for people and drops the tint behind a real photo", () => {
    expect(mountAvatar({ entityType: "patient", name: "Mateusz Dotestowania" }).find(".app-avatar__initials").text()).toBe("MD");
    expect(
      mountAvatar({ entityType: "patient", name: "Jan Kowalski", avatarUrl: "https://example.com/a.png" }).classes(),
    ).toContain("app-avatar--photo");
  });
});
