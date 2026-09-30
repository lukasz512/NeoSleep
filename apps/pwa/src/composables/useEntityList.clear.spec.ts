// CORE-45: "Clear filters" returns the whole list to its first state — filters, search,
// sort, rows per page and page — on every list (they all go through useEntityList).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { effectScope, nextTick } from "vue";
import { setActivePinia, createPinia } from "pinia";
import { setPrefsIdentity, prefsKey, readPref, WRITE_DEBOUNCE_MS } from "@prefs";

const requests: string[] = [];
vi.mock("vue-router", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (k: string) => k }) }));
vi.mock("./useApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./useApi")>()),
  apiFetch: vi.fn(async (url: string) => {
    requests.push(url);
    return new Response(JSON.stringify({ items: [], total: 0 }), { status: 200 });
  }),
}));

import { useEntityList, clearListSnapshots } from "./useEntityList";
import { DEFAULT_TABLE_STATE } from "./useListTableState";

const alice = { tenant: "acme", userId: "u-1" };

function mount() {
  const scope = effectScope();
  const list = scope.run(() =>
    useEntityList({
      viewId: "leads",
      apiEndpoint: "/api/v1/lead",
      filterDefinitions: [{ key: "status", labelKey: "x", type: "select", default: "" }],
      filterParamKeys: ["status"],
      i18n: { errorLoad: "x" },
      cacheable: false,
    }),
  )!;
  return { list, stop: () => scope.stop() };
}

describe("useEntityList › Clear filters (CORE-45)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    requests.length = 0;
    clearListSnapshots();
    setActivePinia(createPinia());
    setPrefsIdentity(alice);
  });
  afterEach(() => {
    setPrefsIdentity(null);
    vi.useRealTimers();
  });

  it("resets filters, search, sort, rows per page and page — and remembers the reset", async () => {
    const { list, stop } = mount();
    list.filterState.value = { status: ["new"] };
    list.searchQuery.value = "lopez";
    list.tableOptions.value = { page: 3, itemsPerPage: 50, sortBy: [{ key: "name", order: "asc" }] };
    await nextTick();

    const done = list.onFiltersClear();
    await vi.runAllTimersAsync();
    await done;

    expect(list.filterState.value).toEqual({ status: [] });
    expect(list.searchQuery.value).toBe("");
    expect(list.tableOptions.value).toEqual({ page: 1, ...DEFAULT_TABLE_STATE });
    const last = new URLSearchParams(requests.at(-1)!.split("?")[1]);
    expect(Object.fromEntries(last)).toEqual({ page: "1", limit: "10", sortBy: "created_at", sortOrder: "desc" });

    vi.advanceTimersByTime(WRITE_DEBOUNCE_MS + 1);
    expect(readPref(localStorage, prefsKey(alice, "view:leads:table"))).toEqual(DEFAULT_TABLE_STATE);
    stop();
  });

  it("clearing the search box alone keeps the sort and rows per page", async () => {
    const { list, stop } = mount();
    list.tableOptions.value = { page: 2, itemsPerPage: 25, sortBy: [{ key: "name", order: "asc" }] };
    list.searchQuery.value = "lopez";
    await nextTick();
    const done = list.onSearchClear();
    await vi.runAllTimersAsync();
    await done;
    expect(list.tableOptions.value).toEqual({ page: 1, itemsPerPage: 25, sortBy: [{ key: "name", order: "asc" }] });
    stop();
  });

  it("Reset view (table footer) restores sort, rows per page and page but keeps filters and search", async () => {
    const { list, stop } = mount();
    expect(list.isTableAtDefault.value).toBe(true);
    list.filterState.value = { status: ["new"] };
    list.searchQuery.value = "lopez";
    list.tableOptions.value = { page: 3, itemsPerPage: 50, sortBy: [{ key: "name", order: "asc" }] };
    await nextTick();
    expect(list.isTableAtDefault.value).toBe(false);

    const done = list.onTableReset();
    await vi.runAllTimersAsync();
    await done;

    expect(list.tableOptions.value).toEqual({ page: 1, ...DEFAULT_TABLE_STATE });
    expect(list.isTableAtDefault.value).toBe(true);
    expect(list.filterState.value).toEqual({ status: ["new"] });
    expect(list.searchQuery.value).toBe("lopez");
    const last = new URLSearchParams(requests.at(-1)!.split("?")[1]);
    expect(last.get("limit")).toBe("10");
    expect(last.get("sortBy")).toBe("created_at");
    expect(last.get("status")).toBe("new");
    stop();
  });

  it("only a different page does not count as a changed view", async () => {
    const { list, stop } = mount();
    list.tableOptions.value = { ...list.tableOptions.value, page: 4 };
    await nextTick();
    expect(list.isTableAtDefault.value).toBe(true);
    stop();
  });
});
