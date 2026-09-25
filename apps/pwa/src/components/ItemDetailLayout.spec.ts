import { describe, it, expect, afterEach } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import { createRouter, createMemoryHistory } from "vue-router";
import { createI18n } from "vue-i18n";
import { h } from "vue";
import { createPinia } from "pinia";
import en from "@i18n/en.json";
import ItemDetailLayout from "./ItemDetailLayout.vue";

// NEO-56: breadcrumbs sit right after the back arrow on every detail view.
// The parent crumb is derived from backRoute (same nav title as the sidebar),
// the rest comes from `trail`; the last crumb is the current page.

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
      { path: "/patients", name: "patients", component: Stub },
      { path: "/leads", name: "leads", component: Stub },
      { path: "/documents", name: "document-content", component: Stub },
    ],
  });
}

type Props = InstanceType<typeof ItemDetailLayout>["$props"];

function mountLayout(props: Partial<Props>, slots?: Record<string, () => ReturnType<typeof h>>) {
  const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });
  const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
  const wrapper = mount(ItemDetailLayout, {
    props: {
      hasContent: true,
      loading: false,
      backRoute: { name: "patients" },
      backLabel: "Back to patients",
      notFoundLabel: "Not found",
      ...props,
    } as Props,
    slots,
    global: { plugins: [vuetify, i18n, makeRouter(), createPinia()] },
  });
  mountedWrappers.push(wrapper);
  return wrapper;
}

describe("ItemDetailLayout — breadcrumbs", () => {
  it("renders parent link + record name after the back arrow", () => {
    const wrapper = mountLayout({ trail: ["Jan Kowalski"] });

    const nav = wrapper.find("nav.view-item__breadcrumbs");
    expect(nav.exists()).toBe(true);
    expect(nav.attributes("aria-label")).toBe(en["app.common.breadcrumbs"]);

    const link = nav.find("a.view-item__crumb-link");
    expect(link.text()).toBe(en["user.patients.title"]);
    expect(link.attributes("href")).toBe("/patients");

    // DOM order: back button first, breadcrumbs right after it.
    const row = wrapper.find(".view-item__header-row").element;
    expect(row.children[0].classList.contains("view-item__back-btn")).toBe(true);
    expect(row.children[1].classList.contains("view-item__breadcrumbs")).toBe(true);
  });

  it("marks only the last crumb as the current page, and it is not a link", () => {
    const wrapper = mountLayout({ backRoute: { name: "document-content" }, trail: ["GDPR consent", "Polish"] });

    const items = wrapper.findAll("li.view-item__crumb");
    expect(items.map((li) => li.text())).toEqual([en["user.document-content.title"], "GDPR consent", "Polish"]);
    expect(items[1].attributes("aria-current")).toBeUndefined();
    expect(items[2].attributes("aria-current")).toBe("page");
    expect(items[2].find("a").exists()).toBe(false);
  });

  it("shows just the parent when there is no trail", () => {
    const wrapper = mountLayout({});
    expect(wrapper.findAll("li.view-item__crumb")).toHaveLength(1);
  });

  it("puts a separator before an inline header-title (lead detail) instead of a trail crumb", () => {
    const wrapper = mountLayout(
      { backRoute: { name: "leads" } },
      { "header-title": () => h("h1", "Maria Wiśniewska") },
    );
    const nav = wrapper.find("nav.view-item__breadcrumbs");
    expect(nav.find("a").text()).toBe(en["user.leads.title"]);
    expect(nav.findAll(".view-item__crumb-sep")).toHaveLength(1);
    expect(wrapper.find(".view-item__header-title").text()).toBe("Maria Wiśniewska");
  });

  it("renders no breadcrumbs while loading or when the record is missing", () => {
    expect(mountLayout({ hasContent: false, loading: true }).find("nav.view-item__breadcrumbs").exists()).toBe(false);
    expect(mountLayout({ hasContent: false }).find("nav.view-item__breadcrumbs").exists()).toBe(false);
  });

  it("renders no breadcrumbs when the back route is a plain path (no nav title to show)", () => {
    const wrapper = mountLayout({ backRoute: "/somewhere" });
    expect(wrapper.find("nav.view-item__breadcrumbs").exists()).toBe(false);
  });
});
