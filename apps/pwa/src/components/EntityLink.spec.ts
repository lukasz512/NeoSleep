import { describe, it, expect, afterEach } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import { createRouter, createMemoryHistory } from "vue-router";
import { h } from "vue";
import EntityLink from "./EntityLink.vue";
import AppAvatar from "./AppAvatar.vue";

// EntityLink is the one shared "avatar + display name (+ link)" cell (NEO-13).
// These pin down the behaviors every list/panel call site relies on, so a
// change here can't silently regress one of the ~15 places that render
// through it.

const mountedWrappers: VueWrapper[] = [];

afterEach(() => {
  for (const w of mountedWrappers.splice(0)) w.unmount();
});

const Stub = { render: () => null };
function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", component: Stub },
      { path: "/hcp/:id", name: "hcp-detail", component: Stub },
      { path: "/hco/:id", name: "hco-detail", component: Stub },
      { path: "/patients/:id", name: "patient-detail", component: Stub },
      { path: "/users/:id", name: "user-detail", component: Stub },
    ],
  });
}

type Props = InstanceType<typeof EntityLink>["$props"];

function mountLink(props: Props, slot?: () => ReturnType<typeof h>) {
  const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });
  const wrapper = mount(EntityLink, {
    props,
    slots: slot ? { default: slot } : undefined,
    global: { plugins: [vuetify, makeRouter()] },
  });
  mountedWrappers.push(wrapper);
  return wrapper;
}

describe("EntityLink — rendering modes", () => {
  it("renders a link with avatar + label when both `to` and `label` are set", () => {
    const wrapper = mountLink({ to: { name: "hcp-detail", params: { id: "p1" } }, label: "Dra. Ana López" });

    const link = wrapper.find("a.entity-link");
    expect(link.exists()).toBe(true);
    expect(link.attributes("href")).toBe("/hcp/p1");
    expect(link.text()).toContain("Dra. Ana López");
    expect(wrapper.findComponent(AppAvatar).exists()).toBe(true);
  });

  it("renders plain (no link) avatar + label when `to` is null — list rows that navigate as a whole", () => {
    const wrapper = mountLink({ to: null, label: "Dr. Jorge Mena", entityType: "hcp" });

    expect(wrapper.find("a").exists()).toBe(false);
    expect(wrapper.find(".entity-link__plain").text()).toContain("Dr. Jorge Mena");
    expect(wrapper.findComponent(AppAvatar).exists()).toBe(true);
  });

  it.each([null, undefined, ""])("renders only the empty-cell dash, no avatar, when label is %j", (label) => {
    const wrapper = mountLink({ to: { name: "hcp-detail", params: { id: "p1" } }, label });

    expect(wrapper.find(".entity-link__empty").text()).toBe("—");
    expect(wrapper.findComponent(AppAvatar).exists()).toBe(false);
    expect(wrapper.find("a").exists()).toBe(false);
  });

  it("renders the default slot between the avatar and the label (Leads' gender icon)", () => {
    const wrapper = mountLink({ to: null, label: "Ana López", entityType: "lead" }, () => h("i", { class: "slot-marker" }));

    const children = wrapper.find(".entity-link__plain").element.children;
    const order = Array.from(children).map((el) => (el.classList.contains("slot-marker") ? "slot" : el.tagName === "SPAN" ? "label" : "avatar"));
    expect(order).toEqual(["avatar", "slot", "label"]);
  });
});

describe("EntityLink — avatar entity type", () => {
  it("derives the entity type from the route name", () => {
    const wrapper = mountLink({ to: { name: "patient-detail", params: { id: "x" } }, label: "Lucia Paz" });
    expect(wrapper.findComponent(AppAvatar).props("entityType")).toBe("patient");
  });

  it("an explicit entityType wins over the route-derived one", () => {
    const wrapper = mountLink({ to: { name: "user-detail", params: { id: "x" } }, label: "Dr. QA Pilot", entityType: "hcp" });
    expect(wrapper.findComponent(AppAvatar).props("entityType")).toBe("hcp");
  });

  it("falls back to 'user' when there's neither a route nor an explicit type", () => {
    const wrapper = mountLink({ to: null, label: "Someone" });
    expect(wrapper.findComponent(AppAvatar).props("entityType")).toBe("user");
  });
});

describe("EntityLink — avatar initials and size", () => {
  it("uses the name parts for initials, so a salutation or multi-word name never skews them", () => {
    const wrapper = mountLink({
      to: null,
      entityType: "hcp",
      label: "Dra. Lorena Alejandra González Pimentel",
      firstName: "Lorena Alejandra",
      lastName: "González Pimentel",
    });

    expect(wrapper.find(".app-avatar__initials").text()).toBe("LG");
  });

  it("without name parts, still skips the salutation when deriving initials from the label", () => {
    const wrapper = mountLink({ to: null, entityType: "hcp", label: "Dr. Jorge Mena" });
    expect(wrapper.find(".app-avatar__initials").text()).toBe("JM");
  });

  it("a place (HCO) gets its icon, never initials — even with name parts passed", () => {
    const wrapper = mountLink({
      to: { name: "hco-detail", params: { id: "o1" } },
      label: "Clínica Dra. Laura Cuicas",
      firstName: "Laura",
      lastName: "Cuicas",
    });

    const avatar = wrapper.findComponent(AppAvatar);
    expect(avatar.props("name")).toBeNull();
    expect(avatar.props("firstName")).toBeNull();
    expect(wrapper.find(".app-avatar__initials").exists()).toBe(false);
  });

  it("defaults to the small 20px link avatar and passes avatarSize through for list-row cells", () => {
    expect(mountLink({ to: null, label: "A B" }).findComponent(AppAvatar).props("size")).toBe(20);
    expect(mountLink({ to: null, label: "A B", avatarSize: 32 }).findComponent(AppAvatar).props("size")).toBe(32);
  });
});

describe("EntityLink — large identity (NEO-57)", () => {
  it("renders one plain line under the name, with extras behind a +N", () => {
    const wrapper = mountLink({
      to: { name: "hcp-detail", params: { id: "p1" } },
      label: "Dra. Ana López",
      details: ["Dentist"],
      moreDetails: ["Orthodontist"],
    });

    expect(wrapper.find(".entity-link__label").text()).toBe("Dra. Ana López");
    expect(wrapper.find(".identity-details").text()).toContain("Dentist");
    expect(wrapper.find(".identity-details__more").text()).toBe("+1");
  });

  it("joins several details with a middle dot, no labels", () => {
    const wrapper = mountLink({ to: null, label: "Ana López", entityType: "patient", details: ["F", "47 y"] });
    expect(wrapper.find(".identity-details").text()).toBe("F · 47 y");
  });

  it("is the small identity (name only) when there are no details", () => {
    const wrapper = mountLink({ to: null, label: "Dra. Ana López", entityType: "hcp" });

    expect(wrapper.find(".identity-details").exists()).toBe(false);
    expect(wrapper.find(".entity-link--two-line").exists()).toBe(false);
    expect(wrapper.text()).toContain("Dra. Ana López");
  });
});
