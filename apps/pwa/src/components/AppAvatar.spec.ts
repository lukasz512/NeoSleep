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

describe("AppAvatar (doctor badge, NEO-57)", () => {
  it("gives a doctor a stethoscope badge and keeps their initials", () => {
    const wrapper = mountAvatar({ entityType: "hcp", name: "Lorena González", size: 32 });
    expect(wrapper.find("[data-testid=app-avatar-doctor-badge]").exists()).toBe(true);
    expect(wrapper.find(".app-avatar__initials").text()).toBe("LG");
  });

  it("the badge shows the doctor's specialty icon, stethoscope when unknown", () => {
    const dentist = mount(AppAvatar, {
      props: { entityType: "hcp", name: "Lorena González", specialty: "dentist" },
      global: { plugins: [createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives })] },
    });
    mountedWrappers.push(dentist);
    expect(dentist.find("[data-testid=app-avatar-doctor-badge]").findComponent(AppIcon).props("name")).toBe("specialty-dentist");

    const unknown = mountAvatar({ entityType: "hcp", name: "Jan Kowalski" });
    expect(unknown.find("[data-testid=app-avatar-doctor-badge]").findComponent(AppIcon).props("name")).toBe("nav-hcp");
  });

  it("shows the badge at every size, and never for other identities", () => {
    expect(mountAvatar({ entityType: "patient", name: "Anna Nowak" }).find("[data-testid=app-avatar-doctor-badge]").exists()).toBe(false);
    expect(mountAvatar({ entityType: "hco" }).find("[data-testid=app-avatar-doctor-badge]").exists()).toBe(false);
    expect(mountAvatar({ entityType: "hcp", name: "Jan Kowalski", size: 16 }).find("[data-testid=app-avatar-doctor-badge]").exists()).toBe(true);
  });
});

describe("AppAvatar (color families, NEO-155)", () => {
  const tintOf = (w: VueWrapper) => w.attributes("data-tint");

  it("tints each type from its own family, the tint within it seeded from the name", () => {
    expect(tintOf(mountAvatar({ entityType: "patient", name: "Anna Nowak" }))).toMatch(/^patient-\d$/);
    expect(tintOf(mountAvatar({ entityType: "hcp", name: "Anna Nowak" }))).toMatch(/^doctor-\d$/);
    expect(tintOf(mountAvatar({ entityType: "user", name: "Anna Nowak" }))).toMatch(/^person-\d$/);
    expect(tintOf(mountAvatar({ entityType: "patient", name: "Anna Nowak" }))).toBe(tintOf(mountAvatar({ entityType: "patient", name: "Anna Nowak" })));
    expect(mountAvatar({ entityType: "patient", name: "Anna Nowak" }).attributes("style")).toMatch(/--app-avatar-bg: var\(--pwa-avatar-patient-\d-bg\)/);
  });

  it("varies across a list of different patients", () => {
    const names = ["Adam Nowak", "María López", "Anna Kowalska", "Jan Wiśniewski", "Carlos Ruiz", "Ewa Zielińska"];
    expect(new Set(names.map((name) => tintOf(mountAvatar({ entityType: "patient", name })))).size).toBeGreaterThanOrEqual(3);
  });

  it("tints organizations by type, not by name", () => {
    expect(tintOf(mountAvatar({ entityType: "hco", orgType: "hospital" }))).not.toBe(tintOf(mountAvatar({ entityType: "hco", orgType: "pharmacy" })));
    expect(mountAvatar({ entityType: "hco", orgType: "hospital" }).classes()).toContain("app-avatar--org");
  });
});

describe("AppAvatar (lead outline + channel badge, order ring, NEO-155)", () => {
  it("marks a lead with the outline, nobody else", () => {
    expect(mountAvatar({ entityType: "lead", name: "Carlos Ruiz" }).classes()).toContain("app-avatar--lead");
    expect(mountAvatar({ entityType: "user", name: "Carlos Ruiz" }).classes()).not.toContain("app-avatar--lead");
  });

  it("shows the lead's channel badge only for a known channel", () => {
    const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });
    const lead = (leadSource: string | null) => {
      const w = mount(AppAvatar, { props: { entityType: "lead", name: "Carlos Ruiz", leadSource }, global: { plugins: [vuetify] } });
      mountedWrappers.push(w);
      return w.find("[data-testid=app-avatar-lead-badge]");
    };
    expect(lead("whatsapp").findComponent(AppIcon).props("name")).toBe("lead-source-whatsapp");
    expect(lead("website").findComponent(AppIcon).props("name")).toBe("lead-source-website");
    expect(lead(null).exists()).toBe(false);
    expect(lead("fax").exists()).toBe(false);
  });

  it("draws the order ring only for a patient with a live order", () => {
    const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });
    const ring = (entityType: AppAvatarEntityType, orderStatus: string | null) => {
      const w = mount(AppAvatar, { props: { entityType, name: "Adam Nowak", orderStatus }, global: { plugins: [vuetify] } });
      mountedWrappers.push(w);
      return w;
    };
    const shipped = ring("patient", "shipped");
    expect(shipped.find("[data-testid=app-avatar-order-ring]").exists()).toBe(true);
    expect(shipped.attributes("style")).toContain("--app-avatar-order-progress: 0.8");
    expect(ring("patient", null).find("[data-testid=app-avatar-order-ring]").exists()).toBe(false);
    expect(ring("patient", "cancelled").find("[data-testid=app-avatar-order-ring]").exists()).toBe(false);
    expect(ring("user", "shipped").find("[data-testid=app-avatar-order-ring]").exists()).toBe(false);
  });
});

describe("AppAvatar (photo)", () => {

  it("keeps initials for people and drops the tint behind a real photo", () => {
    expect(mountAvatar({ entityType: "patient", name: "Mateusz Dotestowania" }).find(".app-avatar__initials").text()).toBe("MD");
    expect(
      mountAvatar({ entityType: "patient", name: "Jan Kowalski", avatarUrl: "https://example.com/a.png" }).classes(),
    ).toContain("app-avatar--photo");
  });
});
