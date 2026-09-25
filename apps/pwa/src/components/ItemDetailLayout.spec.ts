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
import AppBreadcrumbs from "./AppBreadcrumbs.vue";

// NEO-56 record header (Salesforce Lightning / Veeva pattern): module tile,
// parent eyebrow link, the record's name as the h1, actions — no back arrow.
// The arrow only comes back when there is no record to describe.

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
      recordTitle: "Jan Kowalski",
      ...props,
    } as Props,
    slots: { "header-actions": () => h("button", { class: "act" }, "Edit"), ...slots },
    global: { plugins: [vuetify, i18n, makeRouter(), createPinia()] },
  });
  mountedWrappers.push(wrapper);
  return wrapper;
}

const header = (w: VueWrapper) => w.find("header.view-item__record-header");
const backBtn = (w: VueWrapper) => w.find(".view-item__back-btn");

describe("ItemDetailLayout — record header", () => {
  it("renders tile (module icon), parent eyebrow link, the name as the only h1, and the actions — no back arrow", () => {
    const wrapper = mountLayout({});
    expect(header(wrapper).exists()).toBe(true);
    expect(backBtn(wrapper).exists()).toBe(false);

    expect(header(wrapper).find(".view-item__tile").exists()).toBe(true);
    const items = wrapper.findComponent(AppBreadcrumbs).props("items");
    expect(items).toEqual([{ label: en["user.patients.title"], to: { name: "patients" }, icon: "nav-patients" }]);

    const h1s = wrapper.findAll("h1");
    expect(h1s).toHaveLength(1);
    expect(h1s[0]!.text()).toBe("Jan Kowalski");
    expect(header(wrapper).find(".act").exists()).toBe(true);
  });

  it("puts title-extra (badges) next to the name", () => {
    const wrapper = mountLayout({}, { "title-extra": () => h("span", { class: "badge" }, "Invited") });
    expect(wrapper.find(".view-item__record-title-row .badge").text()).toBe("Invited");
  });

  it("while loading: the same header with a placeholder instead of the name, and no actions yet", () => {
    const wrapper = mountLayout({ hasContent: false, loading: true, recordTitle: "" });
    expect(header(wrapper).exists()).toBe(true);
    expect(wrapper.find(".view-item__record-title-skeleton").exists()).toBe(true);
    expect(wrapper.find("h1").exists()).toBe(false);
    expect(wrapper.find(".act").exists()).toBe(false);
  });

  it("not found / load error: no record header, the back arrow instead", () => {
    for (const props of [{ hasContent: false }, { hasContent: false, loadError: true }]) {
      const wrapper = mountLayout(props);
      expect(header(wrapper).exists()).toBe(false);
      expect(backBtn(wrapper).exists()).toBe(true);
    }
  });

  it("a view that passes no recordTitle keeps the plain back-arrow row", () => {
    const wrapper = mountLayout({ recordTitle: undefined });
    expect(header(wrapper).exists()).toBe(false);
    expect(backBtn(wrapper).exists()).toBe(true);
  });

  it("a plain-path back route has no module to name: back arrow", () => {
    const wrapper = mountLayout({ backRoute: "/somewhere" });
    expect(header(wrapper).exists()).toBe(false);
    expect(backBtn(wrapper).exists()).toBe(true);
  });
});
