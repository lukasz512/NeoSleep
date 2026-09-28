import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { effectScope, nextTick } from "vue";
import { setPrefsIdentity, prefsKey, writePref, WRITE_DEBOUNCE_MS } from "@prefs";
import { useListTableState, DEFAULT_TABLE_STATE } from "./useListTableState";

const alice = { tenant: "acme", userId: "u-1" };
const slot = "view:patients:table";

function mount() {
  const scope = effectScope();
  const tableOptions = scope.run(() => useListTableState("patients"))!;
  return { tableOptions, stop: () => scope.stop() };
}

async function settle() {
  await nextTick();
  vi.advanceTimersByTime(WRITE_DEBOUNCE_MS + 1);
}

describe("useListTableState", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    setPrefsIdentity(alice);
  });
  afterEach(() => {
    setPrefsIdentity(null);
    vi.useRealTimers();
  });

  it("starts at page 1 with the default sort and page size", () => {
    const { tableOptions, stop } = mount();
    expect(tableOptions.value).toEqual({ page: 1, ...DEFAULT_TABLE_STATE });
    stop();
  });

  it("sort and rows per page survive a reload; the page number does not", async () => {
    const first = mount();
    first.tableOptions.value = { page: 3, itemsPerPage: 25, sortBy: [{ key: "last_name", order: "asc" }] };
    await settle();
    first.stop();

    const second = mount();
    expect(second.tableOptions.value).toEqual({ page: 1, itemsPerPage: 25, sortBy: [{ key: "last_name", order: "asc" }] });
    second.stop();
  });

  it("keeps Vuetify's extra option keys working (v-model:options replaces the whole object)", async () => {
    const { tableOptions, stop } = mount();
    tableOptions.value = { ...tableOptions.value, itemsPerPage: 50, groupBy: [], search: "" } as typeof tableOptions.value;
    await settle();
    expect(JSON.parse(localStorage.getItem(prefsKey(alice, slot))!).v).toEqual({ itemsPerPage: 50, sortBy: DEFAULT_TABLE_STATE.sortBy });
    stop();
  });

  it("ignores a stored page size the table doesn't offer (e.g. 'All') and a bad sort order", () => {
    writePref(localStorage, prefsKey(alice, slot), { itemsPerPage: -1, sortBy: [{ key: "name", order: "sideways" }] });
    const { tableOptions, stop } = mount();
    expect(tableOptions.value.itemsPerPage).toBe(DEFAULT_TABLE_STATE.itemsPerPage);
    expect(tableOptions.value.sortBy).toEqual(DEFAULT_TABLE_STATE.sortBy);
    stop();
  });

  it("switches to the next user's table settings when the account changes", async () => {
    writePref(localStorage, prefsKey(alice, slot), { itemsPerPage: 50, sortBy: DEFAULT_TABLE_STATE.sortBy });
    const { tableOptions, stop } = mount();
    expect(tableOptions.value.itemsPerPage).toBe(50);
    setPrefsIdentity({ tenant: "acme", userId: "u-2" });
    await settle();
    expect(tableOptions.value.itemsPerPage).toBe(DEFAULT_TABLE_STATE.itemsPerPage);
    stop();
  });
});
