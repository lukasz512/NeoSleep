import { describe, it, expect, afterEach } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import { createRouter, createMemoryHistory, type Router } from "vue-router";
import en from "@i18n/en.json";
import AppNavLinks from "./AppNavLinks.vue";
import { routes } from "../../router/routes";

const mountedWrappers: VueWrapper[] = [];

afterEach(() => {
  for (const w of mountedWrappers.splice(0)) w.unmount();
});

function createTestRouter(): Router {
  return createRouter({ history: createMemoryHistory(), routes });
}

async function mountNavLinks(collapsed: boolean) {
  setActivePinia(createPinia());
  const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
  const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });
  const router = createTestRouter();
  await router.push("/dashboard");
  await router.isReady();

  const wrapper = mount(AppNavLinks, {
    props: { collapsed },
    global: { plugins: [i18n, vuetify, router] },
  });
  mountedWrappers.push(wrapper);
  return wrapper;
}

describe("AppNavLinks — desktop sidebar spacing", () => {
  it("adds the --expanded padding modifier when the sidebar is not collapsed", async () => {
    const wrapper = await mountNavLinks(false);
    expect(wrapper.find(".layout-app__nav").classes()).toContain("layout-app__nav--expanded");
  });

  it("omits the --expanded modifier in rail (collapsed) mode, keeping the tight default spacing", async () => {
    const wrapper = await mountNavLinks(true);
    expect(wrapper.find(".layout-app__nav").classes()).not.toContain("layout-app__nav--expanded");
  });
});
