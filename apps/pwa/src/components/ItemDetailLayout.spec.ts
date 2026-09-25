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

// NEO-56: desktop shows breadcrumbs instead of the back arrow, phones keep the
// arrow (the swap itself is CSS at 768px — covered by the real-browser
// e2e/breadcrumbs.spec.ts). Here: which pieces render, and with what data.

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

const backBtn = (w: VueWrapper) => w.find(".view-item__back-btn");

describe("ItemDetailLayout — breadcrumbs vs back arrow", () => {
  it("with a record: breadcrumbs = parent (from backRoute) + the given trail; arrow is phone-only", () => {
    const wrapper = mountLayout({ breadcrumbs: [{ label: "Jan Kowalski" }, { label: "Details" }] });

    const crumbs = wrapper.findComponent(AppBreadcrumbs);
    expect(crumbs.exists()).toBe(true);
    const items = crumbs.props("items");
    expect(items.map((i: { label: string }) => i.label)).toEqual([en["user.patients.title"], "Jan Kowalski", "Details"]);
    expect(items[0].to).toEqual({ name: "patients" });
    expect(items[0].icon).toBe("nav-patients");

    expect(backBtn(wrapper).classes()).toContain("view-item__back-btn--phone-only");
  });

  it("while loading: breadcrumbs with a placeholder for the record, so nothing jumps", () => {
    const wrapper = mountLayout({ hasContent: false, loading: true });
    const crumbs = wrapper.findComponent(AppBreadcrumbs);
    expect(crumbs.exists()).toBe(true);
    expect(crumbs.props("loading")).toBe(true);
  });

  it("not found / load error: no breadcrumbs, and the back arrow shows on every width", () => {
    for (const props of [{ hasContent: false }, { hasContent: false, loadError: true }]) {
      const wrapper = mountLayout(props);
      expect(wrapper.findComponent(AppBreadcrumbs).exists()).toBe(false);
      expect(backBtn(wrapper).classes()).not.toContain("view-item__back-btn--phone-only");
    }
  });

  it("lead detail (inline header-title, no trail): parent + trailing separator before the inline name", () => {
    const wrapper = mountLayout(
      { backRoute: { name: "leads" } },
      { "header-title": () => h("h1", "Maria Wiśniewska") },
    );
    const crumbs = wrapper.findComponent(AppBreadcrumbs);
    expect(crumbs.props("trailingSeparator")).toBe(true);
    expect(wrapper.find(".view-item__header-title").text()).toBe("Maria Wiśniewska");
  });

  it("a plain-path back route has no nav title: arrow only, everywhere", () => {
    const wrapper = mountLayout({ backRoute: "/somewhere" });
    expect(wrapper.findComponent(AppBreadcrumbs).exists()).toBe(false);
    expect(backBtn(wrapper).classes()).not.toContain("view-item__back-btn--phone-only");
  });
});
