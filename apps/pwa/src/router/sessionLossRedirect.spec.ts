import { describe, it, expect, vi } from "vitest";
import { createRouter, createMemoryHistory } from "vue-router";
import { defineComponent, h, nextTick, ref } from "vue";
import { installSessionLossRedirect, installCrossTabSessionSync } from "./sessionLossRedirect";

/**
 * Regression guard for "the app freezes and switches to Jan Kowalski": the
 * session died mid-use, the user went null, but the screen stayed up with the
 * placeholder name because the router guard only runs on navigation.
 */

const Blank = defineComponent({ render: () => h("div") });

async function setup(startPath: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/login", component: Blank, meta: { public: true } },
      { path: "/patients/:id", component: Blank, meta: { requiresAuth: true } },
    ],
  });
  const userId = ref<string | null>("u-1");
  const notify = vi.fn();
  installSessionLossRedirect(router, { userId, notify, message: () => "Session ended" });
  await router.push(startPath);
  return { router, userId, notify };
}

async function flush(): Promise<void> {
  await nextTick();
  await new Promise((r) => setTimeout(r, 0));
}

describe("installSessionLossRedirect", () => {
  it("goes to /login with the current page as redirect when the user disappears on a protected screen", async () => {
    const { router, userId, notify } = await setup("/patients/42");
    userId.value = null;
    await flush();
    expect(router.currentRoute.value.path).toBe("/login");
    expect(router.currentRoute.value.query.redirect).toBe("/patients/42");
    expect(notify).toHaveBeenCalledWith("Session ended", "warning", "session-ended");
  });

  it("does nothing while still signed in or when the user only changes", async () => {
    const { router, userId, notify } = await setup("/patients/42");
    userId.value = "u-2";
    await flush();
    expect(router.currentRoute.value.path).toBe("/patients/42");
    expect(notify).not.toHaveBeenCalled();
  });

  it("does nothing on a public page (e.g. the login form itself)", async () => {
    const { router, userId, notify } = await setup("/login");
    userId.value = null;
    await flush();
    expect(router.currentRoute.value.path).toBe("/login");
    expect(notify).not.toHaveBeenCalled();
  });
});

describe("installCrossTabSessionSync", () => {
  const KEY = "app-session-user";

  function setupSync() {
    const data = new Map<string, string>();
    const storage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => { data.set(k, v); },
      removeItem: (k: string) => { data.delete(k); },
    };
    let listener: ((e: { key: string | null; newValue: string | null }) => void) | null = null;
    const userId = ref<string | null>("u-1");
    const signOut = vi.fn();
    const reload = vi.fn();
    installCrossTabSessionSync(KEY, { userId, storage, onStorage: (l) => { listener = l; }, signOut, reload });
    const otherTab = (newValue: string | null, key: string = KEY) => listener?.({ key, newValue });
    return { data, userId, signOut, reload, otherTab };
  }

  it("publishes who is signed in, and clears it on sign-out", async () => {
    const { data, userId } = setupSync();
    expect(data.get(KEY)).toBe("u-1");
    userId.value = null;
    await nextTick();
    expect(data.has(KEY)).toBe(false);
  });

  it("a tab booting with nobody signed in yet does not clear the other tabs' session", () => {
    const data = new Map<string, string>([[KEY, "u-1"]]);
    const storage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => { data.set(k, v); },
      removeItem: (k: string) => { data.delete(k); },
    };
    installCrossTabSessionSync(KEY, { userId: ref<string | null>(null), storage, onStorage: () => {}, signOut: vi.fn(), reload: vi.fn() });
    expect(data.get(KEY)).toBe("u-1");
  });

  it("signs this tab out when another tab signs out", () => {
    const { otherTab, signOut, reload } = setupSync();
    otherTab(null);
    expect(signOut).toHaveBeenCalledOnce();
    expect(reload).not.toHaveBeenCalled();
  });

  it("reloads when another tab signs in as a different person", () => {
    const { otherTab, signOut, reload } = setupSync();
    otherTab("u-2");
    expect(reload).toHaveBeenCalledOnce();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("ignores the same person and unrelated keys", () => {
    const { otherTab, signOut, reload } = setupSync();
    otherTab("u-1");
    otherTab(null, "app-settings");
    expect(signOut).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });
});
