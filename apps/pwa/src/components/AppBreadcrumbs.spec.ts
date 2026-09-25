import { describe, it, expect, afterEach } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import { createRouter, createMemoryHistory } from "vue-router";
import { createI18n } from "vue-i18n";
import en from "@i18n/en.json";
import AppBreadcrumbs from "./AppBreadcrumbs.vue";

// NEO-56: the record header's eyebrow trail — ancestors only (the current
// page is the h1 right below it). Real layout/hit-area checks live in
// e2e/breadcrumbs.spec.ts.

const mountedWrappers: VueWrapper[] = [];
afterEach(() => {
  for (const w of mountedWrappers.splice(0)) w.unmount();
});

const Stub = { render: () => null };

function mountCrumbs() {
  const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });
  const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", component: Stub },
      { path: "/documents", name: "document-content", component: Stub },
      { path: "/documents/:key", name: "document-template", component: Stub },
    ],
  });
  const wrapper = mount(AppBreadcrumbs, {
    props: {
      items: [
        { label: "Documents", to: { name: "document-content" } },
        { label: "GDPR consent", to: { name: "document-template", params: { key: "gdpr" } } },
      ],
    },
    global: { plugins: [vuetify, i18n, router] },
  });
  mountedWrappers.push(wrapper);
  return wrapper;
}

describe("AppBreadcrumbs", () => {
  it("is a labelled nav with an ordered list of ancestor links", () => {
    const nav = mountCrumbs().find("nav");
    expect(nav.attributes("aria-label")).toBe(en["app.common.breadcrumbs"]);
    const links = nav.findAll("ol > li a");
    expect(links.map((a) => a.text())).toEqual(["Documents", "GDPR consent"]);
    expect(links.map((a) => a.attributes("href"))).toEqual(["/documents", "/documents/gdpr"]);
  });

  it("never marks a current page — the record's h1 is the current page", () => {
    expect(mountCrumbs().find("[aria-current]").exists()).toBe(false);
  });

  it("ends every level with a separator pointing at the title below", () => {
    expect(mountCrumbs().findAll(".app-breadcrumbs__sep")).toHaveLength(2);
  });
});
