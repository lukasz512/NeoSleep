import { describe, it, expect, afterEach, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import { createRouter, createMemoryHistory } from "vue-router";
import { createI18n } from "vue-i18n";
import en from "@i18n/en.json";
import AppBreadcrumbs from "./AppBreadcrumbs.vue";
import AppAvatar from "./AppAvatar.vue";
import type { BreadcrumbItem } from "./AppBreadcrumbs.types";

// NEO-56 medical-grade breadcrumbs: hierarchy trail with record avatar,
// second identifier and exceptional status. Real layout (truncation, the
// desktop/phone swap) is covered in e2e/breadcrumbs.spec.ts.

const mountedWrappers: VueWrapper[] = [];
afterEach(() => {
  for (const w of mountedWrappers.splice(0)) w.unmount();
});

const Stub = { render: () => null };

function mountCrumbs(props: { items: BreadcrumbItem[]; loading?: boolean; trailingSeparator?: boolean }) {
  const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });
  const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", component: Stub },
      { path: "/patients", name: "patients", component: Stub },
    ],
  });
  const wrapper = mount(AppBreadcrumbs, { props, global: { plugins: [vuetify, i18n, router] } });
  mountedWrappers.push(wrapper);
  return wrapper;
}

const patientTrail = (action?: () => void): BreadcrumbItem[] => [
  { label: "Patients", to: { name: "patients" }, icon: "nav-patients" },
  {
    label: "Jan Kowalski",
    avatar: { name: "Jan Kowalski", firstName: "Jan", lastName: "Kowalski", entityType: "patient" },
    secondary: "Mar 12, 1968",
    secondaryLabel: "Date of birth",
    status: { label: "Follow-up", color: "warning" },
    action,
  },
  { label: "Studies" },
];

describe("AppBreadcrumbs", () => {
  it("is a labelled nav with an ordered list", () => {
    const nav = mountCrumbs({ items: patientTrail() }).find("nav");
    expect(nav.attributes("aria-label")).toBe(en["app.common.breadcrumbs"]);
    expect(nav.findAll("ol > li")).toHaveLength(3);
  });

  it("links the parent to its list", () => {
    const link = mountCrumbs({ items: patientTrail() }).find("a");
    expect(link.attributes("href")).toBe("/patients");
    expect(link.text()).toBe("Patients");
  });

  it("shows the record's avatar, second identifier (with a screen-reader label) and status", () => {
    const wrapper = mountCrumbs({ items: patientTrail() });
    const record = wrapper.findAll("ol > li")[1]!;
    expect(record.findComponent(AppAvatar).props("entityType")).toBe("patient");
    const secondary = record.find(".app-breadcrumbs__secondary");
    expect(secondary.text()).toContain("Mar 12, 1968");
    expect(secondary.find(".app-breadcrumbs__sr").text()).toBe("Date of birth");
    expect(record.text()).toContain("Follow-up");
  });

  it("marks only the last crumb as the current page, and it is not interactive", () => {
    const items = mountCrumbs({ items: patientTrail() }).findAll("ol > li");
    expect(items.map((li) => li.attributes("aria-current"))).toEqual([undefined, undefined, "page"]);
    expect(items[2]!.find("a, button").exists()).toBe(false);
  });

  it("renders an in-page action (back to the record's first tab) as a real button", async () => {
    const action = vi.fn();
    const wrapper = mountCrumbs({ items: patientTrail(action) });
    const button = wrapper.findAll("ol > li")[1]!.find("button");
    expect(button.attributes("type")).toBe("button");
    await button.trigger("click");
    expect(action).toHaveBeenCalledOnce();
  });

  it("while loading: a placeholder after the parent, nothing marked current, and the nav is aria-busy", () => {
    const wrapper = mountCrumbs({ items: [patientTrail()[0]!], loading: true });
    expect(wrapper.find("nav").attributes("aria-busy")).toBe("true");
    expect(wrapper.find(".app-breadcrumbs__skeleton").exists()).toBe(true);
    expect(wrapper.find("[aria-current]").exists()).toBe(false);
    expect(wrapper.find("a").exists()).toBe(true);
  });

  it("with a trailing separator the parent stays a link (the record is rendered by the caller)", () => {
    const wrapper = mountCrumbs({ items: [patientTrail()[0]!], trailingSeparator: true });
    expect(wrapper.find("a").exists()).toBe(true);
    expect(wrapper.find("[aria-current]").exists()).toBe(false);
    expect(wrapper.findAll(".app-breadcrumbs__sep")).toHaveLength(1);
  });
});
