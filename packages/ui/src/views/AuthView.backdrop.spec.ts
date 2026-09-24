import { describe, it, expect, vi, afterEach } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import { createRouter, createMemoryHistory } from "vue-router";
import en from "@i18n/en.json";
import { AUTH_BACKDROP_KEY, type AuthBackdrop } from "../composables/authBackdrop";
import AuthView from "./AuthView.vue";

/**
 * AuthView ↔ layout-owned backdrop contract (NEO-52): the breathing orbs live
 * in the public layout, so the view must (1) anchor them behind its card slot,
 * (2) report every loading state so they breathe faster, and (3) hand the
 * post-login exit over to the backdrop (orbs expand, background dissolves)
 * before navigating away.
 */

const STUB_ROUTE = { template: "<div/>" };
const mountedWrappers: VueWrapper[] = [];

afterEach(() => {
  for (const w of mountedWrappers.splice(0)) w.unmount();
  document.body.innerHTML = "";
});

function createFakeBackdrop() {
  const busyLog: [string, boolean][] = [];
  const backdrop = {
    setBusy: vi.fn((source: string, busy: boolean) => busyLog.push([source, busy])),
    registerAnchor: vi.fn(),
    whenEntered: vi.fn(() => Promise.resolve()),
    playExit: vi.fn(() => Promise.resolve()),
  } satisfies AuthBackdrop;
  return { backdrop, busyLog };
}

async function mountWithBackdrop(apiFetch: ReturnType<typeof vi.fn>, backdrop: AuthBackdrop) {
  setActivePinia(createPinia());
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/login", component: STUB_ROUTE },
      { path: "/forgot-password", component: STUB_ROUTE },
      { path: "/reset-password", component: STUB_ROUTE },
      { path: "/dashboard", component: STUB_ROUTE },
      { path: "/patients", component: STUB_ROUTE },
    ],
  });
  await router.push("/login");
  await router.isReady();

  const el = document.createElement("div");
  document.body.appendChild(el);
  const wrapper = mount(AuthView, {
    attachTo: el,
    global: {
      plugins: [
        createI18n({ legacy: false, locale: "en", messages: { en } }),
        createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives }),
        router,
      ],
      provide: { "neo:apiFetch": apiFetch, [AUTH_BACKDROP_KEY as symbol]: backdrop },
    },
  });
  mountedWrappers.push(wrapper);
  await flushPromises();
  return { wrapper, router };
}

describe("AuthView — shared auth backdrop", () => {
  it("anchors the orbs behind its card slot on mount and releases them on unmount", async () => {
    const { backdrop } = createFakeBackdrop();
    const { wrapper } = await mountWithBackdrop(vi.fn(), backdrop);

    const cardSlot = wrapper.find(".auth-view__card-slot").element;
    expect(backdrop.registerAnchor).toHaveBeenCalledWith(cardSlot);

    wrapper.unmount();
    mountedWrappers.splice(0);
    expect(backdrop.registerAnchor).toHaveBeenLastCalledWith(null);
  });

  it("waits for the orbs to finish entering before staging its own card entrance", async () => {
    const { backdrop } = createFakeBackdrop();
    await mountWithBackdrop(vi.fn(), backdrop);
    expect(backdrop.whenEntered).toHaveBeenCalled();
  });

  it("marks the backdrop busy while sign-in is in flight, then plays the backdrop exit on success", async () => {
    const { backdrop, busyLog } = createFakeBackdrop();
    let resolveFetch!: (res: Response) => void;
    const apiFetch = vi.fn().mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }));
    const { wrapper } = await mountWithBackdrop(apiFetch, backdrop);

    expect(busyLog.at(-1)).toEqual(["auth-view", false]);

    await wrapper.find('input[type="email"]').setValue("rep@neosleepcare.com");
    await wrapper.find('input[type="password"]').setValue("correcthorse");
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(busyLog.at(-1)).toEqual(["auth-view", true]);

    resolveFetch(new Response(JSON.stringify({ user: { id: "1" }, forcePasswordChange: false }), { status: 200 }));
    await vi.waitFor(() => expect(backdrop.playExit).toHaveBeenCalledTimes(1), { timeout: 3000 });
  });

  it("does not play the backdrop exit when sign-in fails", async () => {
    const { backdrop, busyLog } = createFakeBackdrop();
    const apiFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Invalid email or password." }), { status: 401 }),
    );
    const { wrapper } = await mountWithBackdrop(apiFetch, backdrop);

    await wrapper.find('input[type="email"]').setValue("rep@neosleepcare.com");
    await wrapper.find('input[type="password"]').setValue("wrongpassword");
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    await flushPromises();

    expect(wrapper.text()).toContain(en["user.login.error.invalidCredentials"]);
    expect(busyLog.at(-1)).toEqual(["auth-view", false]);
    expect(backdrop.playExit).not.toHaveBeenCalled();
  });
});
