import { describe, it, expect, vi } from "vitest";
import type { NavigationHookAfter, RouteLocationNormalized, Router } from "vue-router";
import {
  BOOT_WINDOW_MS,
  RELOAD_GUARD_MS,
  createNeedReloadHandler,
  decideUpdateAction,
  type ServiceWorkerUpdateDeps,
} from "./serviceWorkerUpdate";

describe("decideUpdateAction (NEO-125)", () => {
  it("reloads straight away when the new version takes over right after the page opened", () => {
    expect(decideUpdateAction(2_000, null, 1_000_000)).toBe("reload-now");
    expect(decideUpdateAction(BOOT_WINDOW_MS, null, 1_000_000)).toBe("reload-now");
  });

  it("never reloads a page someone has been using — waits for their next navigation", () => {
    expect(decideUpdateAction(BOOT_WINDOW_MS + 1, null, 1_000_000)).toBe("reload-on-next-navigation");
  });

  it("does not loop: a reload moments ago means do nothing", () => {
    const now = 1_000_000;
    expect(decideUpdateAction(1_000, now - 5_000, now)).toBe("none");
    expect(decideUpdateAction(1_000, now - RELOAD_GUARD_MS - 1, now)).toBe("reload-now");
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
    bootAt: 100_000 - 3_000,
    readGuard: () => guard,
    writeGuard: (at) => (guard = at),
    reload: vi.fn(),
    loadUrl: vi.fn(),
    ...overrides,
  };
}

describe("createNeedReloadHandler (NEO-125)", () => {
  it("reloads right after boot and marks the guard", () => {
    const d = deps();
    const { router } = fakeRouter();
    createNeedReloadHandler(router, d)();
    expect(d.reload).toHaveBeenCalledOnce();
    expect(d.readGuard()).toBe(100_000);
  });

  it("later: no reload now, a full load of the next route instead (with the router base)", () => {
    const d = deps({ bootAt: 100_000 - BOOT_WINDOW_MS - 5_000 });
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
