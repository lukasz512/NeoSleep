import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRouter, createMemoryHistory } from "vue-router";
import { defineComponent, h } from "vue";
import {
  isChunkLoadError,
  recoverFromChunkError,
  installChunkRecovery,
  RELOAD_GUARD_KEY,
  RELOAD_GUARD_MS,
  RELOAD_DELAY_MS,
  type ChunkRecoveryDeps,
} from "./chunkRecovery";

/**
 * Regression guard for "the app freezes, clicks do nothing" after a deploy:
 * the open tab's lazy import of an old hashed chunk rejects, and before this
 * module the navigation was cancelled with no feedback at all. The real-browser
 * version of this (actual engine error messages, actual text/html response)
 * lives in e2e/stale-chunk.spec.ts.
 */

// Verbatim messages from each engine (Chrome's is the one from the bug report).
const CHROME = "Failed to fetch dynamically imported module: https://pwa-dev.neosleepcare.com/assets/PatientDetailView-Buq5Hx2t.js";
const SAFARI = "Importing a module script failed.";
const SAFARI_HTML = "'text/html' is not a valid JavaScript MIME type for module script 'https://pwa-dev.neosleepcare.com/assets/PatientDetailView-Buq5Hx2t.js'.";
const FIREFOX = "error loading dynamically imported module: https://pwa-dev.neosleepcare.com/assets/HCPDetailView-3TFDKiIn.js";
const VITE_CSS = "Unable to preload CSS for /assets/PatientDetailView-abc.css";

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() { return data.size; },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => { data.delete(k); },
    setItem: (k, v) => { data.set(k, v); },
  };
}

function makeDeps(overrides: Partial<ChunkRecoveryDeps> = {}) {
  let clock = 1_000_000;
  const scheduled: Array<() => void> = [];
  const notify = vi.fn<ChunkRecoveryDeps["notify"]>();
  const storage = memoryStorage();
  const deps = {
    notify,
    reload: vi.fn<ChunkRecoveryDeps["reload"]>(),
    storage,
    isOnline: () => true,
    now: () => clock,
    schedule: vi.fn<ChunkRecoveryDeps["schedule"]>((fn) => { scheduled.push(fn); }),
    ...overrides,
  };
  return {
    deps,
    notify,
    storage,
    advance: (ms: number) => { clock += ms; },
    runScheduled: () => scheduled.splice(0).forEach((fn) => fn()),
  };
}

describe("isChunkLoadError", () => {
  it.each([CHROME, SAFARI, SAFARI_HTML, FIREFOX, VITE_CSS])("recognises %s", (msg) => {
    expect(isChunkLoadError(new TypeError(msg))).toBe(true);
  });

  it("ignores unrelated errors, so real bugs still surface normally", () => {
    expect(isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'id')"))).toBe(false);
    expect(isChunkLoadError(new Error("Request failed with status 500"))).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
  });
});

describe("recoverFromChunkError", () => {
  it("tells the user, then reloads into the page they were opening", () => {
    const { deps, runScheduled } = makeDeps();

    expect(recoverFromChunkError("/patients/42", deps)).toBe("reloading");
    expect(deps.notify).toHaveBeenCalledWith("", "info", "app.update.reloading", expect.objectContaining({ countdownMs: RELOAD_DELAY_MS }));
    expect(RELOAD_DELAY_MS).toBe(5_000); // enough to read the toast — never an unexplained reload
    expect(deps.schedule).toHaveBeenCalledWith(expect.any(Function), RELOAD_DELAY_MS);
    expect(deps.reload).not.toHaveBeenCalled(); // the countdown runs first

    runScheduled();
    expect(deps.reload).toHaveBeenCalledWith("/patients/42");
  });

  it("'Reload now' on the countdown toast reloads at once, and the countdown doesn't reload a second time", () => {
    const { deps, notify, runScheduled } = makeDeps();
    recoverFromChunkError("/patients/42", deps);
    const options = notify.mock.calls[0][3];
    expect(options?.action?.labelKey).toBe("notification.action.reloadNow");

    void options?.action?.run();
    expect(deps.reload).toHaveBeenCalledWith("/patients/42");
    runScheduled();
    expect(deps.reload).toHaveBeenCalledTimes(1);
  });

  it("the load-failed toast offers a manual Reload into the same page", () => {
    const { deps, notify, advance } = makeDeps();
    recoverFromChunkError("/patients/42", deps);
    notify.mockClear();
    advance(2_000);
    recoverFromChunkError("/patients/42", deps);

    const options = notify.mock.calls[0][3];
    expect(options?.action?.labelKey).toBe("notification.action.reload");
    void options?.action?.run();
    expect(deps.reload).toHaveBeenCalledWith("/patients/42");
  });

  it("does not loop: a second failure right after a reload shows an error instead", () => {
    const { deps, notify, advance } = makeDeps();
    recoverFromChunkError("/patients/42", deps);
    notify.mockClear();

    advance(2_000);
    expect(recoverFromChunkError("/patients/42", deps)).toBe("failed");
    expect(deps.notify).toHaveBeenCalledWith("", "error", "app.update.loadFailed", expect.objectContaining({ icon: "refresh" }));
    expect(deps.schedule).toHaveBeenCalledTimes(1);
  });

  it("recovers again for a later deploy once the guard window has passed", () => {
    const { deps, advance } = makeDeps();
    recoverFromChunkError("/patients/42", deps);

    advance(RELOAD_GUARD_MS + 1);
    expect(recoverFromChunkError("/hcp/7", deps)).toBe("reloading");
  });

  it("after a failed retry the guard resets, so the user's next click can try again", () => {
    const { deps, storage, advance } = makeDeps();
    recoverFromChunkError("/patients/42", deps);
    advance(1_000);
    recoverFromChunkError("/patients/42", deps);

    expect(storage.getItem(RELOAD_GUARD_KEY)).toBeNull();
    expect(recoverFromChunkError("/patients/42", deps)).toBe("reloading");
  });

  it("offline: explains instead of reloading into a dead page", () => {
    const { deps } = makeDeps({ isOnline: () => false });

    expect(recoverFromChunkError("/patients/42", deps)).toBe("offline");
    expect(deps.notify).toHaveBeenCalledWith("", "warning", "app.update.offline", { icon: "sad-cloud" });
    expect(deps.schedule).not.toHaveBeenCalled();
  });

  it("storage blocked: never reloads blind (no loop guard), shows an error", () => {
    const blocked = memoryStorage();
    blocked.setItem = () => { throw new DOMException("QuotaExceededError"); };
    const { deps } = makeDeps({ storage: blocked });

    expect(recoverFromChunkError("/patients/42", deps)).toBe("failed");
    expect(deps.notify).toHaveBeenCalledWith("", "error", "app.update.loadFailed", expect.objectContaining({ icon: "refresh" }));
    expect(deps.schedule).not.toHaveBeenCalled();
  });
});

describe("installChunkRecovery on a real router", () => {
  const List = defineComponent({ render: () => h("div", "list") });

  function makeRouter(detail: () => Promise<unknown>) {
    return createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/patients", component: List },
        { path: "/patients/:id", component: detail as never },
      ],
    });
  }

  let harness: ReturnType<typeof makeDeps>;
  beforeEach(() => {
    harness = makeDeps();
  });

  it("a stale lazy route (the reported bug) reloads into the clicked detail page with a toast", async () => {
    const router = makeRouter(() => Promise.reject(new TypeError(CHROME)));
    installChunkRecovery(router, harness.deps);
    await router.push("/patients");

    await expect(router.push("/patients/42?tab=history")).rejects.toThrow(CHROME);

    expect(harness.deps.notify).toHaveBeenCalledWith("", "info", "app.update.reloading", expect.objectContaining({ countdownMs: RELOAD_DELAY_MS }));
    harness.runScheduled();
    expect(harness.deps.reload).toHaveBeenCalledWith("/patients/42?tab=history");
  });

  it("the same failure reported twice (router + unhandled rejection) is handled once", async () => {
    const router = makeRouter(() => Promise.reject(new TypeError(CHROME)));
    installChunkRecovery(router, harness.deps);
    await router.push("/patients");

    await router.push("/patients/42").catch(() => {});
    window.dispatchEvent(Object.assign(new Event("unhandledrejection"), { reason: new TypeError(CHROME) }));

    expect(harness.deps.notify).toHaveBeenCalledTimes(1);
  });

  it("offline: one warning toast, not one per hook", async () => {
    harness = makeDeps({ isOnline: () => false });
    const router = makeRouter(() => Promise.reject(new TypeError(SAFARI)));
    installChunkRecovery(router, harness.deps);
    await router.push("/patients");

    await router.push("/patients/42").catch(() => {});
    window.dispatchEvent(Object.assign(new Event("unhandledrejection"), { reason: new TypeError(SAFARI) }));

    expect(harness.deps.notify).toHaveBeenCalledTimes(1);
  });

  it("leaves unrelated navigation errors alone", async () => {
    const router = makeRouter(() => Promise.reject(new Error("boom")));
    installChunkRecovery(router, harness.deps);
    await router.push("/patients");

    await router.push("/patients/42").catch(() => {});

    expect(harness.deps.notify).not.toHaveBeenCalled();
  });
});
