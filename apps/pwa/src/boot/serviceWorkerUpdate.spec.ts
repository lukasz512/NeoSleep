import { describe, it, expect, vi } from "vitest";
import type { NavigationHookAfter, RouteLocationNormalized, Router } from "vue-router";
import {
  RELOAD_GUARD_MS,
  browserDeps,
  createNeedReloadHandler,
  decideUpdateAction,
  type ServiceWorkerUpdateDeps,
} from "./serviceWorkerUpdate";

describe("decideUpdateAction (NEO-125)", () => {
  it("reloads straight away on an untouched page, however long the new version took to download", () => {
    expect(decideUpdateAction(false, null, 1_000_000)).toBe("reload-now");
  });

  it("never reloads a page someone has touched — waits for their next navigation", () => {
    expect(decideUpdateAction(true, null, 1_000_000)).toBe("reload-on-next-navigation");
  });

  it("does not loop: a reload moments ago means do nothing", () => {
    const now = 1_000_000;
    expect(decideUpdateAction(false, now - 5_000, now)).toBe("none");
    expect(decideUpdateAction(false, now - RELOAD_GUARD_MS - 1, now)).toBe("reload-now");
  });
});

function fakeRouter() {
  const hooks: NavigationHookAfter[] = [];
  const router = {
    afterEach: (hook: NavigationHookAfter) => {
      hooks.push(hook);
      return () => undefined;
    },
    resolve: (path: string) => ({ href: `/app${path}` }),
  } as unknown as Pick<Router, "afterEach" | "resolve">;
  const navigate = (from: string, to: string) =>
    hooks.forEach((h) =>
      h({ fullPath: to } as RouteLocationNormalized, { fullPath: from } as RouteLocationNormalized, undefined),
    );
  return { router, navigate };
}

function deps(overrides: Partial<ServiceWorkerUpdateDeps> = {}): ServiceWorkerUpdateDeps {
  let guard: number | null = null;
  return {
    now: () => 100_000,
    hasInteracted: () => false,
    readGuard: () => guard,
    writeGuard: (at) => (guard = at),
    reload: vi.fn(),
    loadUrl: vi.fn(),
    ...overrides,
  };
}

describe("createNeedReloadHandler (NEO-125)", () => {
  it("reloads an untouched page and marks the guard", () => {
    const d = deps();
    const { router } = fakeRouter();
    createNeedReloadHandler(router, d)();
    expect(d.reload).toHaveBeenCalledOnce();
    expect(d.readGuard()).toBe(100_000);
  });

  it("touched page: no reload now, a full load of the next route instead (with the router base)", () => {
    const d = deps({ hasInteracted: () => true });
    const { router, navigate } = fakeRouter();
    createNeedReloadHandler(router, d)();
    expect(d.reload).not.toHaveBeenCalled();
    navigate("/patients", "/patients/42");
    expect(d.loadUrl).toHaveBeenCalledWith("/app/patients/42");
    navigate("/patients/42", "/patients");
    expect(d.loadUrl).toHaveBeenCalledOnce();
  });

  it("does nothing on navigations when no update is pending", () => {
    const d = deps();
    const { router, navigate } = fakeRouter();
    createNeedReloadHandler(router, d);
    navigate("/a", "/b");
    expect(d.loadUrl).not.toHaveBeenCalled();
  });
});

describe("browserDeps (NEO-125)", () => {
  it("a tap or a key press marks the page as in use; scrolling does not", () => {
    const d = browserDeps();
    expect(d.hasInteracted()).toBe(false);
    window.dispatchEvent(new Event("scroll"));
    expect(d.hasInteracted()).toBe(false);
    window.dispatchEvent(new Event("pointerdown"));
    expect(d.hasInteracted()).toBe(true);
    const d2 = browserDeps();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    expect(d2.hasInteracted()).toBe(true);
  });
});
