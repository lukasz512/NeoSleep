import { describe, it, expect, afterEach } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import AppDataTable from "./AppDataTable.vue";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const HEADERS = [
  { title: "Name", key: "name" },
  { title: "City", key: "city" },
];
const ITEMS = [
  { id: "1", name: "Alpha", city: "Warsaw" },
  { id: "2", name: "Beta", city: "Krakow" },
];

const mountedWrappers: VueWrapper[] = [];

afterEach(() => {
  for (const w of mountedWrappers.splice(0)) w.unmount();
  document.body.innerHTML = "";
});

function mountTable(opts: { items?: Record<string, unknown>[]; noResultsText?: string } = {}) {
  const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });

  const el = document.createElement("div");
  document.body.appendChild(el);

  const wrapper = mount(AppDataTable, {
    attachTo: el,
    props: {
      headers: HEADERS,
      items: opts.items ?? ITEMS,
      noResultsText: opts.noResultsText ?? "",
    },
    global: { plugins: [vuetify] },
  });
  mountedWrappers.push(wrapper);
  return wrapper;
}

describe("AppDataTable", () => {
  it("renders the desktop table wrap with the given headers/items", () => {
    const wrapper = mountTable();
    const wrap = wrapper.find(".app-data-table__table-wrap");
    expect(wrap.exists()).toBe(true);
    expect(wrap.text()).toContain("Alpha");
    expect(wrap.text()).toContain("Beta");
  });

  it("renders one mobile feed card per item, titled from the first header", () => {
    const wrapper = mountTable();
    const cards = wrapper.findAll(".app-data-table__card");
    expect(cards).toHaveLength(2);
    expect(cards[0]!.text()).toContain("Alpha");
    expect(cards[1]!.text()).toContain("Beta");
  });

  it("shows the no-results alert only when items is empty and noResultsText is set", () => {
    const withResults = mountTable({ noResultsText: "Nothing here" });
    expect(withResults.find(".app-data-table__empty").exists()).toBe(false);

    const empty = mountTable({ items: [], noResultsText: "Nothing here" });
    const alert = empty.find(".app-data-table__empty");
    expect(alert.exists()).toBe(true);
    expect(alert.text()).toContain("Nothing here");
  });

  // CSS values aren't observable through a jsdom mount (no layout/paint
  // engine) — read the scoped stylesheet directly instead. Same pattern as
  // RepEntityList.spec.ts's "styling facts" block for AppEntityList.css.
  describe("styling facts (NEO-15: shared --pwa-table-border token)", () => {
    const source = readFileSync(path.resolve(__dirname, "./AppDataTable.vue"), "utf-8");

    it("table-wrap border uses --pwa-table-border, not Vuetify's generic --v-border-color", () => {
      expect(source).toMatch(/\.app-data-table__table-wrap\s*{[^}]*border:\s*1px solid var\(--pwa-table-border\)/);
      expect(source).not.toMatch(/border:\s*1px solid rgba\(var\(--v-border-color\)/);
    });
  });
});
