import { describe, it, expect, afterEach, vi } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import { createRouter, createMemoryHistory, type Router } from "vue-router";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import en from "@i18n/en.json";
import AppEntityList from "./AppEntityList.vue";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const I18N = {
  searchPlaceholder: "user.leads.searchPlaceholder",
  filtersTitle: "user.leads.filters.title",
  filtersClear: "user.leads.filters.clear",
  add: "user.leads.add",
  emptyTitle: "user.leads.emptyTitle",
  emptySubtitle: "user.leads.emptySubtitle",
  noResultsForCriteria: "user.leads.noResultsForCriteria",
  noResultsForCriteriaSubtitle: "user.leads.noResultsForCriteriaSubtitle",
  tableNoResults: "user.leads.table.noResults",
  errorLoad: "user.leads.errorLoad",
};

const STUB_ROUTE = { template: "<div/>" };

function createTestRouter(): Router {
  return createRouter({ history: createMemoryHistory(), routes: [{ path: "/", component: STUB_ROUTE }] });
}

function fakeListResponse(items: Record<string, unknown>[] = [{ id: "1", name: "Test Item" }]) {
  return {
    ok: true,
    status: 200,
    clone() {
      return this;
    },
    json: () => Promise.resolve({ items, total: items.length }),
    text: () => Promise.resolve(JSON.stringify({ items, total: items.length })),
  } as unknown as Response;
}

const mountedWrappers: VueWrapper[] = [];

afterEach(() => {
  for (const w of mountedWrappers.splice(0)) w.unmount();
  document.body.innerHTML = "";
});

async function mountEntityList(opts: {
  items?: Record<string, unknown>[];
  showAddButton?: boolean;
} = {}) {
  setActivePinia(createPinia());
  const router = createTestRouter();
  await router.push("/");
  await router.isReady();

  const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
  const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });

  vi_stubFetch(() => Promise.resolve(fakeListResponse(opts.items)));

  const el = document.createElement("div");
  document.body.appendChild(el);

  const wrapper = mount(AppEntityList, {
    attachTo: el,
    props: {
      viewId: "leads",
      apiEndpoint: "/api/v1/leads",
      headers: [{ title: "Name", key: "name" }],
      filterDefinitions: [
        { key: "status", type: "select", labelKey: "user.leads.filters.status", options: [{ title: "New", value: "new" }] },
      ],
      i18n: I18N,
      showAddButton: opts.showAddButton ?? true,
      cacheable: false,
    },
    global: { plugins: [i18n, vuetify, router], stubs: { transition: false, "transition-group": false } },
  });
  mountedWrappers.push(wrapper);
  await flushPromises();

  return wrapper;
}

// Minimal manual fetch stub (avoids pulling in vi.stubGlobal timing issues with top-level await in mount()).
function vi_stubFetch(impl: () => Promise<Response>) {
  (globalThis as unknown as { fetch: typeof fetch }).fetch = impl as unknown as typeof fetch;
}

describe("AppEntityList", () => {
  describe("toolbar icons (filter and add)", () => {
    it("shows the add button with a visible plus icon (no VIcon), no border, min touch target", async () => {
      const wrapper = await mountEntityList();
      const addBtn = wrapper.find(".app-entity-list__add");
      expect(addBtn.exists()).toBe(true);
      expect(addBtn.classes()).toContain("app-entity-list__add--no-border");
      expect(addBtn.findComponent({ name: "VIcon" }).exists()).toBe(false);

      const icon = addBtn.find("svg.app-entity-list__icon");
      expect(icon.exists()).toBe(true);
      expect(icon.attributes("stroke")).toBe("currentColor");
      // plus icon: two crossing lines, no circular outline around it
      expect(addBtn.find("circle").exists()).toBe(false);
    });

    it("emits add when the add button is clicked", async () => {
      const wrapper = await mountEntityList();
      await wrapper.find(".app-entity-list__add").trigger("click");
      expect(wrapper.emitted("add")).toHaveLength(1);
    });

    it("hides the add button entirely when showAddButton is false", async () => {
      const wrapper = await mountEntityList({ showAddButton: false });
      expect(wrapper.find(".app-entity-list__add").exists()).toBe(false);
    });

    it("clear-filters button is hidden until search or filters are active, then clears on click", async () => {
      const wrapper = await mountEntityList();
      expect(wrapper.find(".app-entity-list__clear-filters-wrap").classes()).toContain(
        "app-entity-list__clear-filters-wrap--hidden",
      );

      await wrapper.find(".app-entity-list__search input").setValue("acme");
      await flushPromises();
      expect(wrapper.find(".app-entity-list__clear-filters-wrap").classes()).not.toContain(
        "app-entity-list__clear-filters-wrap--hidden",
      );

      await wrapper.find(".app-entity-list__clear-filters").trigger("click");
      await flushPromises();
      expect((wrapper.find(".app-entity-list__search input").element as HTMLInputElement).value).toBe("");
    });
  });

  describe("no-results placeholder (filtered empty state)", () => {
    it("shows a search icon above the title when a search/filter yields zero results", async () => {
      // Start with results so the toolbar (and search field) is on screen —
      // an empty initial load renders AppEmptyState instead, not the toolbar.
      const wrapper = await mountEntityList({ items: [{ id: "1", name: "Existing" }] });
      vi.useFakeTimers();
      vi_stubFetch(() => Promise.resolve(fakeListResponse([])));
      await wrapper.find(".app-entity-list__search input").setValue("no-such-lead");
      await vi.advanceTimersByTimeAsync(350); // searchQuery watcher debounces 300ms
      await flushPromises();
      vi.useRealTimers();

      const iconWrap = wrapper.find(".app-entity-list__no-results-icon-wrap");
      expect(iconWrap.exists()).toBe(true);
      expect(iconWrap.attributes("aria-hidden")).toBe("true");
      const icon = iconWrap.find("svg.app-entity-list__no-results-icon");
      expect(icon.exists()).toBe(true);
      expect(icon.attributes("stroke")).toBe("currentColor");
    });
  });

  describe("search input clear button", () => {
    it("shows the search clear button only once there is text, and clears it on click", async () => {
      const wrapper = await mountEntityList();
      expect(wrapper.find(".app-entity-list__search-clear-wrap").classes()).toContain(
        "app-entity-list__search-clear-wrap--hidden",
      );

      await wrapper.find(".app-entity-list__search input").setValue("acme");
      await flushPromises();
      expect(wrapper.find(".app-entity-list__search-clear-wrap").classes()).not.toContain(
        "app-entity-list__search-clear-wrap--hidden",
      );

      await wrapper.find(".app-entity-list__search-clear").trigger("click");
      await flushPromises();
      expect((wrapper.find(".app-entity-list__search input").element as HTMLInputElement).value).toBe("");
    });
  });

  describe("mobile feed list", () => {
    it("renders one card per item, keyed and ordered the same as the API response", async () => {
      const wrapper = await mountEntityList({
        items: [
          { id: "a", name: "Alpha" },
          { id: "b", name: "Beta" },
        ],
      });
      const cards = wrapper.findAll(".app-entity-list__card");
      expect(cards).toHaveLength(2);
      expect(cards[0]!.text()).toContain("Alpha");
      expect(cards[1]!.text()).toContain("Beta");
    });
  });

  // CSS values (easing curves, exact colors, breakpoints) aren't observable
  // through a jsdom mount — no layout/paint engine to read computed styles
  // from. These read the actual stylesheets instead of asserting on DOM
  // behavior. Styles for this component live in AppEntityList.css (scoped,
  // `<style scoped src>`) and the shared mobile-feed stagger animation in
  // assets/transitions.css (global, shared with other feeds) — not inlined
  // in the .vue file, so both are checked here.
  describe("styling facts (AppEntityList.css / assets/transitions.css)", () => {
    const css = readFileSync(path.resolve(__dirname, "./AppEntityList.css"), "utf-8");
    const transitionsCss = readFileSync(
      path.resolve(__dirname, "../assets/transitions.css"),
      "utf-8",
    );

    it("add button has no border and uses the primary color", () => {
      expect(css).toMatch(/\.app-entity-list__add--no-border\s*{[^}]*border:\s*none/);
      expect(css).toMatch(/\.app-entity-list__add\s*{[^}]*--v-theme-primary/);
    });

    it("mobile feed stagger animation uses physics-inspired easing", () => {
      expect(transitionsCss).toContain("list-stagger-enter-active");
      expect(transitionsCss).toContain("list-stagger-leave-active");
      expect(transitionsCss).toContain("list-stagger-move");
      expect(transitionsCss).toMatch(/cubic-bezier\(\s*0\.22\s*,\s*1\s*,\s*0\.36\s*,\s*1\s*\)/);
      expect(transitionsCss).toMatch(/280ms/);
    });

    it("leaving feed items use position absolute for smooth reflow", () => {
      expect(transitionsCss).toMatch(/\.list-stagger-leave-active\s*{[^}]*position:\s*absolute/);
    });

    it("feed container has position relative for absolute leaving items", () => {
      expect(css).toMatch(/\.app-entity-list__feed\s*{[^}]*position:\s*relative/);
    });
  });
});
