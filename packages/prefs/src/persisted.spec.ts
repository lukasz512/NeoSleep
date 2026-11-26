import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { effectScope, nextTick } from "vue";
import { usePersistedState, setPrefsIdentity, WRITE_DEBOUNCE_MS } from "./persisted";
import { prefsKey, writePref } from "./storage";

const alice = { tenant: "acme", userId: "u-1" };
const bob = { tenant: "acme", userId: "u-2" };
const defaults = { status: [] as string[], itemsPerPage: 10 };

function mount<T>(fn: () => T): { value: T; stop: () => void } {
  const scope = effectScope();
  const value = scope.run(fn) as T;
  return { value, stop: () => scope.stop() };
}

async function settle() {
  await nextTick();
  vi.advanceTimersByTime(WRITE_DEBOUNCE_MS + 1);
}

describe("usePersistedState", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    setPrefsIdentity(null);
  });
  afterEach(() => vi.useRealTimers());

  it("starts from defaults and saves changes under the signed-in user's key", async () => {
    setPrefsIdentity(alice);
    const { value: state, stop } = mount(() => usePersistedState("view:leads:filters", defaults));
    expect(state.value).toEqual(defaults);
    state.value.status.push("new");
    await settle();
    expect(JSON.parse(localStorage.getItem(prefsKey(alice, "view:leads:filters"))!).v).toEqual({ status: ["new"], itemsPerPage: 10 });
    stop();
  });

  it("two accounts on one browser each get their own state", async () => {
    setPrefsIdentity(alice);
    const a = mount(() => usePersistedState("view:leads:filters", defaults));
    a.value.value = { ...a.value.value, status: ["new"] };
    await settle();
    a.stop();

    setPrefsIdentity(bob);
    const b = mount(() => usePersistedState("view:leads:filters", defaults));
    expect(b.value.value.status).toEqual([]);
    b.stop();

    setPrefsIdentity(alice);
    const a2 = mount(() => usePersistedState("view:leads:filters", defaults));
    expect(a2.value.value.status).toEqual(["new"]);
    a2.stop();
  });

  it("reloads when the user changes while mounted, without writing the old state into the new slot", async () => {
    setPrefsIdentity(alice);
    const { value: state, stop } = mount(() => usePersistedState("s", defaults));
    state.value = { ...state.value, status: ["mine"] };
    await settle();
    setPrefsIdentity(bob);
    await settle();
    expect(state.value.status).toEqual([]);
    expect(localStorage.getItem(prefsKey(bob, "s"))).toBeNull();
    stop();
  });

  it("saves nothing before sign-in", async () => {
    const { value: state, stop } = mount(() => usePersistedState("s", defaults));
    state.value = { ...state.value, status: ["x"] };
    await settle();
    expect(localStorage.length).toBe(0);
    stop();
  });

  it("drops stored values that fail validation", () => {
    setPrefsIdentity(alice);
    writePref(localStorage, prefsKey(alice, "s"), { status: ["ok", "gone"], itemsPerPage: 10 }, Date.now());
    const { value: state, stop } = mount(() =>
      usePersistedState("s", defaults, { validate: (v) => ({ ...v, status: v.status.filter((s) => s !== "gone") }) }),
    );
    expect(state.value.status).toEqual(["ok"]);
    stop();
  });

  it("normalize runs before shape checks (legacy formats)", () => {
    setPrefsIdentity(alice);
    writePref(localStorage, prefsKey(alice, "s"), { status: "legacy", itemsPerPage: 10 }, Date.now());
    const { value: state, stop } = mount(() =>
      usePersistedState("s", defaults, {
        normalize: (raw) => {
          const r = raw as { status?: unknown };
          return typeof r?.status === "string" ? { ...r, status: [r.status] } : raw;
        },
      }),
    );
    expect(state.value.status).toEqual(["legacy"]);
    stop();
  });

  it("flushes a pending write when the view goes away", async () => {
    setPrefsIdentity(alice);
    const { value: state, stop } = mount(() => usePersistedState("s", defaults));
    state.value = { ...state.value, itemsPerPage: 50 };
    await nextTick();
    stop();
    expect(JSON.parse(localStorage.getItem(prefsKey(alice, "s"))!).v.itemsPerPage).toBe(50);
  });

  it("picks up a change made in another tab", async () => {
    setPrefsIdentity(alice);
    const { value: state, stop } = mount(() => usePersistedState("s", defaults));
    const key = prefsKey(alice, "s");
    writePref(localStorage, key, { status: ["other-tab"], itemsPerPage: 10 }, Date.now());
    window.dispatchEvent(new StorageEvent("storage", { key }));
    await nextTick();
    expect(state.value.status).toEqual(["other-tab"]);
    stop();
  });
});
