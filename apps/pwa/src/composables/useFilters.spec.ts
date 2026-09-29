import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { effectScope, nextTick } from "vue";
import { setPrefsIdentity, prefsKey, writePref, WRITE_DEBOUNCE_MS } from "@prefs";
import { useFilters, type FilterDefinition } from "./useFilters";

const alice = { tenant: "acme", userId: "u-1" };
const bob = { tenant: "acme", userId: "u-2" };
const slot = "view:leads:filters";

const defs: FilterDefinition[] = [
  { key: "status", labelKey: "user.leads.filters.status", type: "select", default: "" },
  { key: "region", labelKey: "user.leads.filters.region", type: "select", default: "" },
];

function mount<T>(fn: () => T) {
  const scope = effectScope();
  const value = scope.run(fn) as T;
  return { ...value, stop: () => scope.stop() };
}

function saved(id = alice) {
  const raw = localStorage.getItem(prefsKey(id, slot));
  return raw ? JSON.parse(raw).v : null;
}

describe("useFilters", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    setPrefsIdentity(alice);
  });
  afterEach(() => {
    setPrefsIdentity(null);
    vi.useRealTimers();
  });

  it("returns initial state from defaults when nothing is saved", () => {
    const { filterState, activeFilterCount, hasActiveFilters, stop } = mount(() => useFilters("leads", defs));
    expect(filterState.value).toEqual({ status: [], region: [] });
    expect(activeFilterCount.value).toBe(0);
    expect(hasActiveFilters.value).toBe(false);
    stop();
  });

  it("restores the signed-in user's saved filters", () => {
    writePref(localStorage, prefsKey(alice, slot), { status: ["qualified"], region: ["North"] });
    const { filterState, activeFilterCount, stop } = mount(() => useFilters("leads", defs));
    expect(filterState.value).toEqual({ status: ["qualified"], region: ["North"] });
    expect(activeFilterCount.value).toBe(2);
    stop();
  });

  it("another account on the same browser does not see them", () => {
    writePref(localStorage, prefsKey(alice, slot), { status: ["qualified"], region: [] });
    setPrefsIdentity(bob);
    const { filterState, stop } = mount(() => useFilters("leads", defs));
    expect(filterState.value.status).toEqual([]);
    stop();
  });

  it("upgrades legacy single-string values to arrays", () => {
    writePref(localStorage, prefsKey(alice, slot), { status: "qualified", region: "North" });
    const { filterState, stop } = mount(() => useFilters("leads", defs));
    expect(filterState.value).toEqual({ status: ["qualified"], region: ["North"] });
    stop();
  });

  it("drops a saved value that is no longer an option, so the list isn't empty for no visible reason", () => {
    writePref(localStorage, prefsKey(alice, slot), { status: ["new", "retired-status"], region: ["Gone"] });
    const withOptions: FilterDefinition[] = [
      { ...defs[0], options: [{ title: "All", value: "" }, { title: "New", value: "new" }] },
      { ...defs[1], options: [{ title: "North", value: "North" }] },
    ];
    const { filterState, stop } = mount(() => useFilters("leads", withOptions));
    expect(filterState.value).toEqual({ status: ["new"], region: [] });
    stop();
  });

  it("keeps saved values when a filter's options aren't known yet", () => {
    writePref(localStorage, prefsKey(alice, slot), { status: ["new"], region: ["North"] });
    const { filterState, stop } = mount(() => useFilters("leads", [{ ...defs[0], options: [] }, defs[1]]));
    expect(filterState.value).toEqual({ status: ["new"], region: ["North"] });
    stop();
  });

  it("clearFilters resets all keys to default", () => {
    writePref(localStorage, prefsKey(alice, slot), { status: ["new"], region: ["Central"] });
    const { filterState, clearFilters, activeFilterCount, stop } = mount(() => useFilters("leads", defs));
    clearFilters();
    expect(filterState.value).toEqual({ status: [], region: [] });
    expect(activeFilterCount.value).toBe(0);
    stop();
  });

  it("saves changes for the signed-in user", async () => {
    const { filterState, stop } = mount(() => useFilters("leads", defs));
    filterState.value = { ...filterState.value, status: ["contacted"] };
    await nextTick();
    vi.advanceTimersByTime(WRITE_DEBOUNCE_MS + 1);
    expect(saved()).toEqual({ status: ["contacted"], region: [] });
    expect(saved(bob)).toBeNull();
    stop();
  });
});
