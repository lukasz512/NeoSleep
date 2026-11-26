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
import { clearListSnapshots } from "../composables/useEntityList";
import { defineComponent, h, ref } from "vue";
import { PAGE_HEADER_ACTIONS_ID, providePageHeader, providePageHeaderRow, type PageHeaderRow } from "../composables/usePageHeader";

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
  clearListSnapshots();
});

async function mountEntityList(opts: {
  items?: Record<string, unknown>[];
  showAddButton?: boolean;
  /** Replace the default successful list response (NEO-81 error-state tests). */
  fetchImpl?: (url: string) => Promise<Response>;
  /** Queue chips (the doctor's Estudios / Tratamientos). */
  queues?: { endpoint: string; options: { value: string; labelKey: string }[]; ariaLabelKey: string; attentionValue?: string };
  /** Viewport width useDisplay() sees; this test Vuetify keeps its default mobile breakpoint (1280). */
  width?: number;
} = {}) {
  setActivePinia(createPinia());
  Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: opts.width ?? 1440 });
  const router = createTestRouter();
  await router.push("/");
  await router.isReady();

  const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
  const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });

  vi_stubFetch(opts.fetchImpl ?? (() => Promise.resolve(fakeListResponse(opts.items))));

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
      ...(opts.queues ? { queues: opts.queues } : {}),
    },
    global: { plugins: [i18n, vuetify, router], stubs: { transition: false, "transition-group": false } },
  });
  mountedWrappers.push(wrapper);
  await flushPromises();
  // Skeleton → list is an out-in <Transition> (NEO-57): Vue only swaps the
  // entering element in after the leave finishes, which it checks on the next
  // animation frames — let those run so the list is actually mounted.
  for (let i = 0; i < 3; i++) await new Promise((r) => requestAnimationFrame(() => r(null)));
  await flushPromises();

  return wrapper;
}

// Minimal manual fetch stub (avoids pulling in vi.stubGlobal timing issues with top-level await in mount()).
function vi_stubFetch(impl: (url: string) => Promise<Response>) {
  (globalThis as unknown as { fetch: typeof fetch }).fetch = impl as unknown as typeof fetch;
}

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    clone() {
      return this;
    },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

const QUEUES = {
  endpoint: "/api/v1/sleep-study/queues",
  options: [
    { value: "action", labelKey: "app.clinicalQueues.queue.action" },
    { value: "active", labelKey: "app.clinicalQueues.queue.active" },
    { value: "done", labelKey: "app.clinicalQueues.queue.done" },
  ],
  ariaLabelKey: "app.clinicalQueues.ariaLabel",
  attentionValue: "action",
};

describe("AppEntityList", () => {
  // The doctor's Estudios / Tratamientos: the chips are part of the page's
  // frame, not of its data — they paint with the skeleton and stay over an
  // empty list instead of popping in after the counts request.
  describe("queue chips while loading", () => {
    it("are on screen with the skeleton before any count has arrived, numbers held by placeholders", async () => {
      const wrapper = await mountEntityList({ queues: QUEUES, fetchImpl: () => new Promise<Response>(() => {}) });
      expect(wrapper.find(".app-entity-list__skeleton").exists()).toBe(true);
      const chips = wrapper.find("[data-testid='entity-list-queues']");
      expect(chips.exists()).toBe(true);
      expect(chips.text()).toContain(en["app.clinicalQueues.queue.action"]);
      expect(chips.text()).toContain(en["app.clinicalQueues.queue.done"]);
      expect(wrapper.findAll("[data-testid='entity-list-queue-count-pending']")).toHaveLength(3);
      expect(wrapper.find("[data-testid='entity-list-queue-count-action']").exists()).toBe(false);
    });

    it("stay over an empty list, with their zero counts", async () => {
      const wrapper = await mountEntityList({
        queues: QUEUES,
        fetchImpl: (url) =>
          Promise.resolve(url.includes("/queues") ? jsonResponse({ action: 0, active: 0, done: 0 }) : fakeListResponse([])),
      });
      expect(wrapper.find(".app-entity-list__empty-wrap").exists()).toBe(true);
      expect(wrapper.find("[data-testid='entity-list-queues']").exists()).toBe(true);
      expect(wrapper.find("[data-testid='entity-list-queue-count-action']").text()).toBe("0");
      expect(wrapper.find("[data-testid='entity-list-queue-count-pending']").exists()).toBe(false);
    });

    it("show the numbers once they arrive", async () => {
      const wrapper = await mountEntityList({
        queues: QUEUES,
        fetchImpl: (url) =>
          Promise.resolve(url.includes("/queues") ? jsonResponse({ action: 2, active: 5, done: 1 }) : fakeListResponse()),
      });
      expect(wrapper.find("[data-testid='entity-list-queue-count-active']").text()).toBe("5");
      expect(wrapper.find("[data-testid='entity-list-queue-count-action']").classes()).toContain("app-entity-list__queue-count--attention");
    });
  });

  // NEO-152: the skeleton has the table's header row (its green rule) so the
  // rule stays exactly where it is when the rows arrive, and the list that
  // replaces it doesn't fade or rise in.
  describe("skeleton → rows in place (NEO-152)", () => {
    it("desktop skeleton carries the header row; the phone one doesn't", async () => {
      const desktop = await mountEntityList({ fetchImpl: () => new Promise<Response>(() => {}) });
      expect(desktop.find(".app-entity-list__skeleton").exists()).toBe(true);
      expect(desktop.find("[data-testid='entity-list-skeleton-head']").exists()).toBe(true);
      for (const w of mountedWrappers.splice(0)) w.unmount();
      const phone = await mountEntityList({ fetchImpl: () => new Promise<Response>(() => {}), width: 390 });
      expect(phone.find(".app-entity-list__skeleton--mobile").exists()).toBe(true);
      expect(phone.find("[data-testid='entity-list-skeleton-head']").exists()).toBe(false);
    });

    it("the list that replaces the skeleton is marked to swap in place", async () => {
      const wrapper = await mountEntityList({ items: [{ id: "1", name: "Ana" }] });
      expect(wrapper.find(".app-entity-list__table-wrap").classes()).toContain("app-entity-list__table-wrap--from-skeleton");
    });

    it("the search field sits in its own slot, so an icon search can lift out without moving its neighbours", async () => {
      const wrapper = await mountEntityList({ width: 390 });
      const slot = wrapper.find(".app-entity-list__search-slot");
      expect(slot.exists()).toBe(true);
      expect(slot.find(".app-entity-list__search").exists()).toBe(true);
      expect(wrapper.find("[data-testid='entity-list-toolbar']").classes()).toContain("app-entity-list__toolbar--compact-search");
    });

    it("in the page header the count names what it counts, and says when a search narrows it", async () => {
      setActivePinia(createPinia());
      Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 1440 });
      const router = createTestRouter();
      await router.push("/");
      await router.isReady();
      const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
      const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });
      vi_stubFetch(() => Promise.resolve(fakeListResponse([{ id: "1", name: "Ana" }, { id: "2", name: "Bo" }])));
      const slot = document.createElement("div");
      slot.id = PAGE_HEADER_ACTIONS_ID;
      document.body.appendChild(slot);
      let row!: PageHeaderRow;
      const Shell = defineComponent({
        setup() {
          providePageHeader(ref(true));
          row = providePageHeaderRow();
          return () =>
            h(AppEntityList, {
              viewId: "leads",
              apiEndpoint: "/api/v1/leads",
              headers: [{ title: "Name", key: "name" }],
              filterDefinitions: [],
              i18n: { ...I18N, countNoun: "leads" },
              cacheable: false,
            });
        },
      });
      const wrapper = mount(Shell, { attachTo: document.body.appendChild(document.createElement("div")), global: { plugins: [i18n, vuetify, router] } });
      mountedWrappers.push(wrapper);
      await flushPromises();
      expect(row.subtitle.value).toBe("2 leads");
      // The toolbar is teleported into the page header's slot.
      const input = slot.querySelector<HTMLInputElement>(".app-entity-list__search input")!;
      input.value = "an";
      input.dispatchEvent(new Event("input"));
      await new Promise((r) => setTimeout(r, 400));
      await flushPromises();
      expect(row.subtitle.value).toBe("2 leads · filtered");
    });

    it("a wide desktop keeps the full search field", async () => {
      const wrapper = await mountEntityList({ width: 1440 });
      expect(wrapper.find("[data-testid='entity-list-toolbar']").classes()).not.toContain("app-entity-list__toolbar--compact-search");
    });
  });

  // NEO-97: coming back to a list (e.g. Back from a record) shows its last
  // page at once and refreshes quietly — no skeleton, so the page transition
  // can fly the record's avatar + name straight back into its row.
  describe("last-shown page", () => {
    async function remount(opts: Parameters<typeof mountEntityList>[0]) {
      for (const w of mountedWrappers.splice(0)) w.unmount();
      return mountEntityList(opts);
    }

    it("a remount renders the previous rows immediately, before its refresh answers", async () => {
      const first = await mountEntityList({ items: [{ id: "7", name: "Sofía Ramírez" }] });
      expect(first.text()).toContain("Sofía Ramírez");
      const second = await remount({ fetchImpl: () => new Promise<Response>(() => {}) });
      expect(second.find(".app-entity-list__skeleton").exists()).toBe(false);
      expect(second.text()).toContain("Sofía Ramírez");
    });

    it("a failed load forgets the page, so the next visit starts from the skeleton again", async () => {
      await mountEntityList({ items: [{ id: "7", name: "Sofía Ramírez" }] });
      await remount({ fetchImpl: () => Promise.reject(new TypeError("Failed to fetch")) });
      const third = await remount({ fetchImpl: () => new Promise<Response>(() => {}) });
      expect(third.find(".app-entity-list__skeleton").exists()).toBe(true);
    });
  });

  // NEO-81: the list's error state says what actually went wrong — a server
  // failure is not a "network problem", and gets a support reference.
  describe("error state by error class", () => {
    it("a 500 says 'problem on our side' with the request reference, not 'Network problem'", async () => {
      const wrapper = await mountEntityList({
        fetchImpl: () =>
          Promise.resolve(
            new Response(JSON.stringify({ error: "Internal server error" }), {
              status: 500,
              headers: { "Content-Type": "application/json", "X-Request-ID": "3f2a9c1e-7b4d-4e21-9a0f-5c8d2e6b1a47" },
            }),
          ),
      });
      const text = wrapper.find(".app-entity-list__error-wrap").text();
      expect(text).toContain(en["common.error.server.title"]);
      expect(text).toContain(en["user.leads.errorLoad"]);
      expect(text).toContain("3f2a9c1e");
      expect(text).not.toContain(en["app.errorState.title"]);
    });

    it("a request that never reached the server says to check the connection", async () => {
      const wrapper = await mountEntityList({ fetchImpl: () => Promise.reject(new TypeError("Failed to fetch")) });
      const text = wrapper.find(".app-entity-list__error-wrap").text();
      expect(text).toContain(en["common.error.network.title"]);
      expect(text).toContain(en["common.error.network.body"]);
    });

    it("a 200 that isn't JSON (e.g. index.html) is a server-side problem, not 'offline'", async () => {
      const wrapper = await mountEntityList({
        fetchImpl: () =>
          Promise.resolve(new Response("<!doctype html><div id=app></div>", { status: 200, headers: { "Content-Type": "text/html" } })),
      });
      const text = wrapper.find(".app-entity-list__error-wrap").text();
      expect(text).toContain(en["common.error.server.title"]);
      expect(text).not.toContain(en["common.error.network.title"]);
    });
  });

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

    it("search group never carries the removed active-state modifier class", async () => {
      const wrapper = await mountEntityList();
      await wrapper.find(".app-entity-list__search input").setValue("acme");
      await flushPromises();
      expect(wrapper.find(".app-entity-list__search-group").classes()).not.toContain(
        "app-entity-list__search-group--active",
      );
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

  describe("phone toolbar: three icons, search expands over the row (NEO-85)", () => {
    const toolbar = () => document.querySelector("[data-testid=entity-list-toolbar]") as HTMLElement;
    const input = () => document.querySelector("[data-testid=entity-list-search] input") as HTMLInputElement;

    it("rests as search + filter + add in one row, search not open", async () => {
      await mountEntityList({ width: 375 });
      expect(toolbar().classList.contains("app-entity-list__toolbar--mobile")).toBe(true);
      expect(toolbar().classList.contains("app-entity-list__toolbar--search-open")).toBe(false);
      expect(document.querySelector("[data-testid=entity-list-filter]")).not.toBeNull();
      expect(document.querySelector("[data-testid=entity-list-add]")).not.toBeNull();
    });

    it("opens while the search is focused, and on blur keeps a typed query as the pill", async () => {
      await mountEntityList({ width: 375 });
      input().focus();
      input().dispatchEvent(new FocusEvent("focus"));
      await flushPromises();
      expect(toolbar().classList.contains("app-entity-list__toolbar--search-open")).toBe(true);

      input().value = "mar";
      input().dispatchEvent(new Event("input"));
      input().blur();
      input().dispatchEvent(new FocusEvent("blur"));
      await flushPromises();
      expect(toolbar().classList.contains("app-entity-list__toolbar--search-open")).toBe(false);
      expect(toolbar().classList.contains("app-entity-list__toolbar--has-query")).toBe(true);
    });

    it("the in-field clear button doesn't steal focus (so the search stays open while clearing)", async () => {
      await mountEntityList({ width: 375 });
      const clear = document.querySelector(".app-entity-list__search-clear") as HTMLElement;
      const down = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
      clear.dispatchEvent(down);
      expect(down.defaultPrevented).toBe(true);
    });

    // NEO-160: with the keyboard up, the first tap on the feed only leaves the
    // search; the next tap is an ordinary tap that opens the card.
    it("first tap on a card while the search is focused only blurs the search; the next tap goes through", async () => {
      await mountEntityList({ width: 375 });
      const card = document.querySelector(".app-entity-list__card") as HTMLElement;
      const tap = () => {
        // jsdom has no PointerEvent constructor; the listener only needs the type.
        card.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
        const click = new MouseEvent("click", { bubbles: true, cancelable: true });
        card.dispatchEvent(click);
        return click;
      };
      input().focus();
      input().dispatchEvent(new FocusEvent("focus"));
      await flushPromises();
      expect(document.activeElement).toBe(input());

      expect(tap().defaultPrevented).toBe(true);
      await flushPromises();
      expect(document.activeElement).not.toBe(input());
      expect(toolbar().classList.contains("app-entity-list__toolbar--search-open")).toBe(false);

      expect(tap().defaultPrevented).toBe(false);
    });

    it("desktop never gets the phone classes", async () => {
      await mountEntityList({ width: 1440 });
      expect(toolbar().classList.contains("app-entity-list__toolbar--mobile")).toBe(false);
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
  // styles/transitions.css (global, shared with other feeds) — not inlined
  // in the .vue file, so both are checked here.
  describe("styling facts (AppEntityList.css / styles/transitions.css)", () => {
    const css = readFileSync(path.resolve(__dirname, "./AppEntityList.css"), "utf-8");
    const transitionsCss = readFileSync(
      path.resolve(__dirname, "../styles/transitions.css"),
      "utf-8",
    );

    // NEO-160: the toolbar clips (overflow: hidden, for the scroll collapse), so
    // it needs room for the focused search's 3 px halo — padding, offset by an
    // equal negative margin so the row doesn't move.
    it("toolbar leaves room for the focus halo without moving the row", () => {
      expect(css).toMatch(/\.app-entity-list__toolbar\s*{[^}]*--app-entity-list-halo-room:\s*4px/);
      expect(css).toMatch(/\.app-entity-list__toolbar\s*{[^}]*padding:\s*var\(--app-entity-list-halo-room\)/);
      expect(css).toMatch(/\.app-entity-list__toolbar\s*{[^}]*margin:\s*calc\(-1 \* var\(--app-entity-list-halo-room\)\)/);
    });

    // NEO-160: outside the page header (a record's tab) the open search grows
    // in the row, so its 48 px slot has to grow too.
    it("the search slot grows while the search is open or holds a query", () => {
      expect(css).toMatch(
        /\.app-entity-list__toolbar--search-open \.app-entity-list__search-slot,\s*\.app-entity-list__toolbar--has-query \.app-entity-list__search-slot\s*{\s*flex:\s*1 1 0%;/,
      );
    });

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

    // NEO-15: the search field's inactive border, the table-wrap border, and
    // the pagination footer each used to pull their color from a different
    // token (theme.scss's global outline color, M3 outline-variant, or
    // nothing at all) and visibly disagreed with each other and with the
    // rest of the app's tables (AppDataTable, RelatedEntityPanel). All of
    // them now share --pwa-table-border.
    // NEO-57 replaced the bordered table box with the "clinical card" look:
    // no outer border, a paper ground, and each row / feed card as its own
    // outlined surface, all driven by the shared --pwa-list-* tokens.
    it("table-wrap has no outer border and a transparent background (blends into the view)", () => {
      expect(css).toMatch(/\.app-entity-list__table-wrap\s*{[^}]*background:\s*transparent/);
      expect(css).not.toMatch(/\.app-entity-list__table-wrap\s*{[^}]*border:\s*1px/);
    });

    it("table height follows its rows (no 70vh floor), so the footer sits right under the last row", () => {
      expect(css).not.toMatch(/\.app-entity-list__table-wrap\s*{[^}]*min-height:\s*70vh/);
      expect(css).toMatch(/\.app-entity-list__table-wrap\s*{[^}]*flex:\s*0 1 auto/);
    });

    it("rows animate in, and stop animating under prefers-reduced-motion", () => {
      expect(css).toMatch(/@keyframes app-entity-list-row-in/);
      expect(css).toMatch(/prefers-reduced-motion:\s*reduce[\s\S]*animation:\s*none/);
    });

    // NEO-85 "record stack": rows are ruled lines on the content sheet, the
    // same line on desktop and phone, in a tint of the (tenant) primary.
    it("table rows and mobile feed cards are the same ruled --pwa-rule line, with no box of their own", () => {
      expect(css).toMatch(/tbody > tr > td\)\s*{[^}]*background:\s*transparent[^}]*box-shadow:\s*inset 0 -1px 0 var\(--pwa-rule\)/);
      expect(css).toMatch(/border-spacing:\s*0;/);
      expect(css).toMatch(
        /\.app-entity-list__card\s*{[^}]*border-radius:\s*0[^}]*background:\s*transparent[^}]*box-shadow:\s*inset 0 -1px 0 var\(--pwa-rule\)/,
      );
    });

    it("the column header is in the brand colour on a stronger rule", () => {
      expect(css).toMatch(/thead > tr > th\)\s*{[^}]*box-shadow:\s*inset 0 -1\.5px 0 var\(--pwa-rule-strong\)[^}]*color:\s*var\(--pwa-primary\)/);
    });

    // CORE-136: the list search wears the Doctor Panel search look.
    it("search field is a filled glass field with 14 px corners", () => {
      expect(css).toMatch(
        /\.app-entity-list__search :deep\(\.v-field\)\s*{[^}]*border-radius:\s*14px !important[^}]*background:\s*color-mix\([^;]*var\(--glass-surface\)\)[^}]*box-shadow:\s*var\(--glass-rim\)[^}]*backdrop-filter:\s*var\(--glass-blur\)/,
      );
    });

    it("search field has no outline; focus shows a soft brand ring instead", () => {
      expect(css).toMatch(/\.app-entity-list__search :deep\(\.v-field__outline\)\s*{\s*display:\s*none/);
      expect(css).toMatch(/\.app-entity-list__search :deep\(\.v-field--focused\)\s*{[^}]*box-shadow:[^}]*var\(--pwa-primary\)/);
    });

    it("filter button beside the search is a matching glass square", () => {
      const filterSrc = readFileSync(path.resolve(__dirname, "./AppFilterBar.vue"), "utf-8");
      expect(filterSrc).toMatch(
        /\.app-filter-bar__btn--no-border\s*{[^}]*border-radius:\s*14px[^}]*background:\s*color-mix\([^;]*var\(--glass-surface\)\)[^}]*box-shadow:\s*var\(--glass-rim\)/,
      );
    });

    it("pagination footer has de-emphasized text instead of Vuetify's unstyled default", () => {
      expect(css).toMatch(/\.v-data-table-footer\)\s*{[^}]*--v-medium-emphasis-opacity/);
    });

    it("rows/footer separator is a single line: Vuetify's divider in --pwa-table-border, no extra footer border-top", () => {
      // A footer border-top stacked on Vuetify's own <VDivider> rendered as a thick double line.
      expect(css).not.toMatch(/\.v-data-table-footer\)\s*{[^}]*border-top/);
      const themeScss = readFileSync(path.resolve(__dirname, "../styles/theme.scss"), "utf-8");
      expect(themeScss).toMatch(/\.v-data-table > \.v-divider\s*{[^}]*border-color:\s*var\(--pwa-table-border\)[^}]*opacity:\s*1/);
    });

    it("footer's items-per-page select renders as plain text: no outline, no chevron", () => {
      const themeScss = readFileSync(path.resolve(__dirname, "../styles/theme.scss"), "utf-8");
      expect(themeScss).toMatch(
        /\.v-data-table-footer__items-per-page \.v-field__outline,\s*\.v-data-table-footer__items-per-page \.v-select__menu-icon\s*{\s*display:\s*none/,
      );
    });

    // NEO-49: the search/filter toolbar used to grow a tonal box-shadow
    // "pill" behind itself once search/filters were active, and the search
    // field animated its flex-basis between a collapsed 44px icon (mobile,
    // at rest) and 610px (focused/typing) — the resulting motion visibly
    // shifted the filter/clear-all icons sitting next to it. Both are gone:
    // no more active-state background, no more animated/collapsing width.
    it("no longer renders an active-state background behind the search/filter group", () => {
      expect(css).not.toMatch(/search-group--active/);
    });

    // NEO-85 brought a collapse back on phones only, on request (three icons,
    // search grows over the row while the others step aside). Desktop keeps
    // the NEO-49 rule: a static width, nothing animating next to filter/add.
    it("desktop search field has a static width; the flex-basis animation exists only in the phone toolbar", () => {
      expect(css).not.toMatch(/search--collapsed/);
      expect(css).toMatch(/\.app-entity-list__search\s*{[^}]*flex:\s*0 1 610px/);
      expect(css).not.toMatch(/^\.app-entity-list__search\s*{[^}]*transition/m);
      const flexBasisTransitions = [...css.matchAll(/([^{}]+)\{[^}]*transition:[^}]*flex-basis/g)].map((m) => m[1]!.trim());
      expect(flexBasisTransitions.length).toBeGreaterThan(0);
      for (const selector of flexBasisTransitions) expect(selector).toContain("app-entity-list__toolbar--mobile");
    });
  });

  describe("pagination footer rendering (NEO-15)", () => {
    it("renders Vuetify's data-table footer inside the styled table-wrap", async () => {
      const wrapper = await mountEntityList({
        items: [
          { id: "a", name: "Alpha" },
          { id: "b", name: "Beta" },
        ],
      });
      const wrap = wrapper.find(".app-entity-list__table-wrap");
      expect(wrap.exists()).toBe(true);
      expect(wrap.find(".v-data-table-footer").exists()).toBe(true);
    });

    it("shows Reset view in the footer only while sort or rows differ from the default (CORE-45)", async () => {
      const wrapper = await mountEntityList({ items: [{ id: "a", name: "Alpha" }] });
      const reset = () => wrapper.find('[data-testid="entity-list-reset-view"]');
      expect(reset().exists()).toBe(false);
      await wrapper.find(".app-entity-list__table-wrap th.v-data-table__th--sortable").trigger("click");
      await flushPromises();
      expect(reset().exists()).toBe(true);
      expect(wrapper.find(".v-data-table-footer").element.contains(reset().element)).toBe(true);
      await reset().trigger("click");
      await flushPromises();
      expect(reset().exists()).toBe(false);
    });
  });
});
