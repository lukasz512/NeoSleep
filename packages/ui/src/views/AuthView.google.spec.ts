import { describe, it, expect, vi, afterEach } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import { createRouter, createMemoryHistory, type Router } from "vue-router";
import en from "@i18n/en.json";
import { useThemeStore } from "@stores";
import AuthView from "./AuthView.vue";
import { googleSignInErrorKey, googleSignInUrl } from "../composables/useGoogleSignIn";

// "Sign in with Google" on the login screen (NEO-78).

const API_URL = "https://api.example.test";
const STUB_ROUTE = { template: "<div/>" };
const mounted: VueWrapper[] = [];

afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount();
  document.body.innerHTML = "";
  localStorage.clear();
});

function providersResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function mountAuthView(opts: {
  apiFetch: ReturnType<typeof vi.fn>;
  apiUrl?: string;
  path?: string;
  dark?: boolean;
}): Promise<{ wrapper: VueWrapper; router: Router; notify: ReturnType<typeof vi.fn> }> {
  setActivePinia(createPinia());
  if (opts.dark) useThemeStore().setPreference("dark");
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/login", component: STUB_ROUTE },
      { path: "/forgot-password", component: STUB_ROUTE },
      { path: "/reset-password", component: STUB_ROUTE },
    ],
  });
  await router.push(opts.path ?? "/login");
  await router.isReady();

  const notify = vi.fn();
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
      provide: {
        "neo:apiFetch": opts.apiFetch,
        "neo:notify": notify,
        ...(opts.apiUrl !== undefined ? { "neo:apiUrl": opts.apiUrl } : {}),
      },
    },
  });
  mounted.push(wrapper);
  await flushPromises();
  await flushPromises();
  return { wrapper, router, notify };
}

const googleButton = (w: VueWrapper) => w.find('[data-testid="google-sign-in"]');

describe("AuthView — Sign in with Google button", () => {
  it("is shown when the API reports Google login as configured, linking to /auth/google with this origin", async () => {
    const apiFetch = vi.fn().mockResolvedValue(providersResponse({ google: true }));
    const { wrapper } = await mountAuthView({ apiFetch, apiUrl: API_URL });

    expect(apiFetch).toHaveBeenCalledWith("/api/v1/auth/providers", expect.objectContaining({ handleErrors: false }));
    const btn = googleButton(wrapper);
    expect(btn.exists()).toBe(true);
    expect(btn.text()).toContain(en["user.login.google.signIn"]);
    expect(btn.attributes("href")).toBe(
      `${API_URL}/api/v1/auth/google?origin=${encodeURIComponent(window.location.origin)}`,
    );
    expect(btn.find("svg").exists()).toBe(true);
    expect(wrapper.text()).toContain(en["user.login.google.or"]);
  });

  it("works with a same-origin API (dev proxy, apiUrl \"\")", async () => {
    const apiFetch = vi.fn().mockResolvedValue(providersResponse({ google: true }));
    const { wrapper } = await mountAuthView({ apiFetch, apiUrl: "" });
    expect(googleButton(wrapper).attributes("href")).toMatch(/^\/api\/v1\/auth\/google\?origin=/);
  });

  it("is hidden when the API reports Google login as not configured", async () => {
    const apiFetch = vi.fn().mockResolvedValue(providersResponse({ google: false }));
    const { wrapper } = await mountAuthView({ apiFetch, apiUrl: API_URL });
    expect(googleButton(wrapper).exists()).toBe(false);
    expect(wrapper.text()).not.toContain(en["user.login.google.signIn"]);
  });

  it("stays hidden when the providers request fails", async () => {
    const apiFetch = vi.fn().mockRejectedValue(new Error("offline"));
    const { wrapper } = await mountAuthView({ apiFetch, apiUrl: API_URL });
    expect(googleButton(wrapper).exists()).toBe(false);
  });

  it("stays hidden on a non-2xx providers response (e.g. an older API without the endpoint)", async () => {
    const apiFetch = vi.fn().mockResolvedValue(providersResponse({ error: "Not found" }, 404));
    const { wrapper } = await mountAuthView({ apiFetch, apiUrl: API_URL });
    expect(googleButton(wrapper).exists()).toBe(false);
  });

  it("is never shown, and nothing is fetched, when the app doesn't provide an API URL", async () => {
    const apiFetch = vi.fn();
    const { wrapper } = await mountAuthView({ apiFetch });
    expect(apiFetch).not.toHaveBeenCalled();
    expect(googleButton(wrapper).exists()).toBe(false);
  });

  it("uses Google's light palette in light mode and its dark palette in dark mode", async () => {
    const light = await mountAuthView({
      apiFetch: vi.fn().mockResolvedValue(providersResponse({ google: true })),
      apiUrl: API_URL,
    });
    expect(googleButton(light.wrapper).classes()).not.toContain("google-sign-in-btn--dark");

    const dark = await mountAuthView({
      apiFetch: vi.fn().mockResolvedValue(providersResponse({ google: true })),
      apiUrl: API_URL,
      dark: true,
    });
    expect(googleButton(dark.wrapper).classes()).toContain("google-sign-in-btn--dark");
  });
});

describe("AuthView — Google callback errors", () => {
  it("explains an unknown Google account with the 'ask your administrator' message and clears ?error", async () => {
    const apiFetch = vi.fn().mockResolvedValue(providersResponse({ google: true }));
    const { notify, router } = await mountAuthView({ apiFetch, apiUrl: API_URL, path: "/login?error=google_no_account" });

    expect(notify).toHaveBeenCalledWith(en["user.login.google.error.noAccount"], "error", "user.login.google.error.noAccount");
    await vi.waitFor(() => expect(router.currentRoute.value.query.error).toBeUndefined());
    expect(router.currentRoute.value.path).toBe("/login");
  });

  it("shows the inactive-account message for google_account_inactive", async () => {
    const apiFetch = vi.fn().mockResolvedValue(providersResponse({ google: true }));
    const { notify } = await mountAuthView({ apiFetch, apiUrl: API_URL, path: "/login?error=google_account_inactive" });
    expect(notify).toHaveBeenCalledWith(en["user.login.google.error.inactive"], "error", "user.login.google.error.inactive");
  });

  it("shows the generic Google failure message for any technical callback error", async () => {
    const apiFetch = vi.fn().mockResolvedValue(providersResponse({ google: true }));
    const { notify } = await mountAuthView({ apiFetch, apiUrl: API_URL, path: "/login?error=token_exchange" });
    expect(notify).toHaveBeenCalledWith(en["user.login.google.error.failed"], "error", "user.login.google.error.failed");
  });

  it("shows nothing on a plain /login", async () => {
    const apiFetch = vi.fn().mockResolvedValue(providersResponse({ google: true }));
    const { notify } = await mountAuthView({ apiFetch, apiUrl: API_URL });
    expect(notify).not.toHaveBeenCalled();
  });
});

describe("useGoogleSignIn helpers", () => {
  it("maps callback codes to i18n keys", () => {
    expect(googleSignInErrorKey("google_no_account")).toBe("user.login.google.error.noAccount");
    expect(googleSignInErrorKey("google_account_inactive")).toBe("user.login.google.error.inactive");
    expect(googleSignInErrorKey("auth_failed")).toBe("user.login.google.error.failed");
    expect(googleSignInErrorKey(undefined)).toBeNull();
    expect(googleSignInErrorKey("")).toBeNull();
    expect(googleSignInErrorKey(["google_no_account"])).toBeNull();
  });

  it("builds the start URL with an encoded origin", () => {
    expect(googleSignInUrl("https://api.x", "https://pwa-dev.neosleepcare.com")).toBe(
      "https://api.x/api/v1/auth/google?origin=https%3A%2F%2Fpwa-dev.neosleepcare.com",
    );
  });
});
