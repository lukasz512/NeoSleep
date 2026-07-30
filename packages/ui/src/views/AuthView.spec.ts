import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import { createRouter, createMemoryHistory, type Router } from "vue-router";
import en from "@i18n/en.json";
import AuthView from "./AuthView.vue";

const STUB_ROUTE = { template: "<div/>" };

function createTestRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/login", component: STUB_ROUTE },
      { path: "/forgot-password", component: STUB_ROUTE },
      { path: "/reset-password", component: STUB_ROUTE },
      { path: "/dashboard", component: STUB_ROUTE },
      { path: "/change-password", component: STUB_ROUTE },
      { path: "/leads/:id", component: STUB_ROUTE },
    ],
  });
}

const mountedWrappers: VueWrapper[] = [];

afterEach(() => {
  for (const w of mountedWrappers.splice(0)) w.unmount();
  document.body.innerHTML = "";
});

async function mountAuthView(
  apiFetch: ReturnType<typeof vi.fn>,
  loginPath = "/login",
): Promise<{ wrapper: VueWrapper; router: Router }> {
  setActivePinia(createPinia());
  const router = createTestRouter();
  await router.push(loginPath);
  await router.isReady();

  const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
  const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });

  const el = document.createElement("div");
  document.body.appendChild(el);

  const wrapper = mount(AuthView, {
    attachTo: el,
    global: {
      plugins: [i18n, vuetify, router],
      provide: { "neo:apiFetch": apiFetch },
    },
  });
  mountedWrappers.push(wrapper);
  await flushPromises();
  return { wrapper, router };
}

async function fillAndSubmit(
  wrapper: VueWrapper,
  email: string,
  password: string,
): Promise<void> {
  await wrapper.find('input[type="email"]').setValue(email);
  await wrapper.find('input[type="password"], input[type="text"]').setValue(password);
  await wrapper.find("form").trigger("submit");
  await flushPromises();
  await flushPromises();
}

// Vuetify's <VBtn to="..."> navigates via vue-router's own async push() under
// the hood, on top of Vue's render tick — a fixed number of flushPromises()
// calls is a race here, so poll for the actual route change instead (same
// pattern already used below for post-login redirects).
async function waitForPath(router: Router, path: string): Promise<void> {
  await vi.waitFor(() => {
    expect(router.currentRoute.value.path).toBe(path);
  }, { timeout: 2000 });
  await flushPromises();
}

async function clickForgotPasswordLink(wrapper: VueWrapper, router: Router): Promise<void> {
  const forgotLink = wrapper.findAll("a").find((a) => a.text() === en["user.login.forgotPassword"]);
  await forgotLink!.trigger("click");
  await waitForPath(router, "/forgot-password");
}

describe("AuthView — sign in", () => {
  let apiFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    apiFetch = vi.fn();
  });

  it("renders email and password inputs and a forgot-password link to /forgot-password", async () => {
    const { wrapper } = await mountAuthView(apiFetch);

    expect(wrapper.find('input[type="email"]').exists()).toBe(true);
    expect(wrapper.find('input[type="password"]').exists()).toBe(true);
    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(true);
    expect(wrapper.text()).toContain(en["user.login.signIn"]);

    const forgotLink = wrapper.findAll("a").find((a) => a.text() === en["user.login.forgotPassword"]);
    expect(forgotLink).toBeTruthy();
    expect(forgotLink!.attributes("href")).toBe("/forgot-password");
  });

  it("shows no back arrow on the sign-in step", async () => {
    const { wrapper } = await mountAuthView(apiFetch);
    expect(wrapper.find(".auth-card__back").exists()).toBe(false);
  });

  it("password field starts masked and toggles visible on the show/hide icon", async () => {
    const { wrapper } = await mountAuthView(apiFetch);

    expect(wrapper.find('input[type="password"]').exists()).toBe(true);

    const toggle = wrapper.find(".v-field__append-inner .v-icon");
    expect(toggle.exists()).toBe(true);
    await toggle.trigger("click");

    expect(wrapper.find('input[type="text"]').exists()).toBe(true);
    expect(wrapper.find('input[type="password"]').exists()).toBe(false);
  });

  it("blocks submit and shows validation messages when email and password are empty", async () => {
    const { wrapper } = await mountAuthView(apiFetch);

    await wrapper.find("form").trigger("submit");
    await flushPromises();
    await flushPromises();

    expect(wrapper.text()).toContain(en["user.login.validation.emailRequired"]);
    expect(wrapper.text()).toContain(en["user.login.validation.passwordRequired"]);
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("blocks submit and shows a validation message for a malformed email", async () => {
    const { wrapper } = await mountAuthView(apiFetch);

    await fillAndSubmit(wrapper, "not-an-email", "somepassword");

    expect(wrapper.text()).toContain(en["user.login.validation.emailInvalid"]);
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("submits trimmed/lowercased email, password, and remember_me to /api/v1/auth/login", async () => {
    apiFetch.mockResolvedValue(
      new Response(JSON.stringify({ user: { id: "1", email: "rep@neosleepcare.com", role: "rep" }, forcePasswordChange: false }), {
        status: 200,
      }),
    );
    const { wrapper } = await mountAuthView(apiFetch);

    await wrapper.find('input[type="checkbox"]').setValue(true);
    await fillAndSubmit(wrapper, "  Rep@NeoSleepCare.com  ", "correcthorse");

    expect(apiFetch).toHaveBeenCalledTimes(1);
    const [path, options] = apiFetch.mock.calls[0]!;
    expect(path).toBe("/api/v1/auth/login");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toEqual({
      email: "rep@neosleepcare.com",
      password: "correcthorse",
      remember_me: true,
    });
  });

  it("shows a loading state and disables inputs while the request is in flight", async () => {
    let resolveFetch!: (res: Response) => void;
    apiFetch.mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }));
    const { wrapper } = await mountAuthView(apiFetch);

    await wrapper.find('input[type="email"]').setValue("rep@neosleepcare.com");
    await wrapper.find('input[type="password"]').setValue("correcthorse");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(wrapper.find('input[type="email"]').attributes("disabled")).not.toBeUndefined();
    expect(wrapper.find('input[type="password"]').attributes("disabled")).not.toBeUndefined();
    expect(wrapper.find(".auth-view__submit").classes()).toContain("v-btn--loading");

    resolveFetch(new Response(JSON.stringify({ user: { id: "1" }, forcePasswordChange: false }), { status: 200 }));

    // router.push() only fires after the full post-login exit choreography
    // (badge → logo → card → orbs → background, see AuthView's
    // playExitSequence) has run its course — comfortably longer than
    // vi.waitFor's default 1000ms timeout, so it's raised here rather than
    // assuming one flushPromises() drains it.
    await vi.waitFor(() => {
      expect(wrapper.find('input[type="email"]').attributes("disabled")).toBeUndefined();
    }, { timeout: 3000 });
  });

  it("shows the invalid-credentials message on a 401 response", async () => {
    apiFetch.mockResolvedValue(new Response(JSON.stringify({ error: "Invalid email or password." }), { status: 401 }));
    const { wrapper } = await mountAuthView(apiFetch);

    await fillAndSubmit(wrapper, "rep@neosleepcare.com", "wrongpassword");

    expect(wrapper.text()).toContain(en["user.login.error.invalidCredentials"]);
  });

  it("shows the too-many-attempts message on a 429 response", async () => {
    apiFetch.mockResolvedValue(new Response(JSON.stringify({ error: "Too many login attempts." }), { status: 429 }));
    const { wrapper } = await mountAuthView(apiFetch);

    await fillAndSubmit(wrapper, "rep@neosleepcare.com", "correcthorse");

    expect(wrapper.text()).toContain(en["user.login.error.tooManyAttempts"]);
  });

  it("shows a generic network error message on a non-ok, non-401/429 response", async () => {
    apiFetch.mockResolvedValue(new Response(JSON.stringify({ error: "Server error." }), { status: 500 }));
    const { wrapper } = await mountAuthView(apiFetch);

    await fillAndSubmit(wrapper, "rep@neosleepcare.com", "correcthorse");

    expect(wrapper.text()).toContain(en["user.login.error.network"]);
  });

  it("shows a generic network error message when the request throws", async () => {
    apiFetch.mockRejectedValue(new TypeError("Failed to fetch"));
    const { wrapper } = await mountAuthView(apiFetch);

    await fillAndSubmit(wrapper, "rep@neosleepcare.com", "correcthorse");

    expect(wrapper.text()).toContain(en["user.login.error.network"]);
  });

  it("redirects to /dashboard on success when there is no redirect query param", async () => {
    apiFetch.mockResolvedValue(
      new Response(JSON.stringify({ user: { id: "1" }, forcePasswordChange: false }), { status: 200 }),
    );
    const { wrapper, router } = await mountAuthView(apiFetch);

    await fillAndSubmit(wrapper, "rep@neosleepcare.com", "correcthorse");

    // Navigation now waits for AnimatedCard's exit transition (~600ms) before
    // the route actually changes — give waitFor enough headroom for that.
    await vi.waitFor(() => {
      expect(router.currentRoute.value.path).toBe("/dashboard");
    }, { timeout: 3000 });
  });

  it("redirects to the ?redirect= path on success when it starts with /", async () => {
    apiFetch.mockResolvedValue(
      new Response(JSON.stringify({ user: { id: "1" }, forcePasswordChange: false }), { status: 200 }),
    );
    const { wrapper, router } = await mountAuthView(apiFetch, "/login?redirect=/leads/123");

    await fillAndSubmit(wrapper, "rep@neosleepcare.com", "correcthorse");

    await vi.waitFor(() => {
      expect(router.currentRoute.value.path).toBe("/leads/123");
    }, { timeout: 3000 });
  });

  it("ignores a ?redirect= value that is not a path and falls back to /dashboard", async () => {
    apiFetch.mockResolvedValue(
      new Response(JSON.stringify({ user: { id: "1" }, forcePasswordChange: false }), { status: 200 }),
    );
    const { wrapper, router } = await mountAuthView(
      apiFetch,
      `/login?redirect=${encodeURIComponent("https://evil.example.com")}`,
    );

    await fillAndSubmit(wrapper, "rep@neosleepcare.com", "correcthorse");

    await vi.waitFor(() => {
      expect(router.currentRoute.value.path).toBe("/dashboard");
    }, { timeout: 3000 });
  });

  it("redirects to /change-password when the server reports forcePasswordChange, ignoring any redirect query", async () => {
    apiFetch.mockResolvedValue(
      new Response(JSON.stringify({ user: { id: "1" }, forcePasswordChange: true }), { status: 200 }),
    );
    const { wrapper, router } = await mountAuthView(apiFetch, "/login?redirect=/leads/123");

    await fillAndSubmit(wrapper, "rep@neosleepcare.com", "correcthorse");

    await vi.waitFor(() => {
      expect(router.currentRoute.value.path).toBe("/change-password");
    }, { timeout: 3000 });
  });
});

describe("AuthView — forgot password (same card, in-place step)", () => {
  let apiFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    apiFetch = vi.fn();
  });

  it("carries the typed sign-in email over to the forgot-password step and hides the sign-in form", async () => {
    const { wrapper, router } = await mountAuthView(apiFetch);

    await wrapper.find('input[type="email"]').setValue("rep@neosleepcare.com");
    await clickForgotPasswordLink(wrapper, router);

    expect(router.currentRoute.value.path).toBe("/forgot-password");
    expect(wrapper.find('input[type="password"]').exists()).toBe(false);
    expect(wrapper.text()).toContain(en["user.forgotPassword.title"]);
    const emailInput = wrapper.find('input[type="email"]');
    expect((emailInput.element as HTMLInputElement).value).toBe("rep@neosleepcare.com");
  });

  it("shows an in-card back arrow that returns to the sign-in step", async () => {
    const { wrapper, router } = await mountAuthView(apiFetch);

    await clickForgotPasswordLink(wrapper, router);
    expect(wrapper.find(".auth-card__back").exists()).toBe(true);

    await wrapper.find(".auth-card__back").trigger("click");
    await waitForPath(router, "/login");

    expect(wrapper.find('input[type="password"]').exists()).toBe(true);
  });

  it("shows a success alert after submitting and redirects back to sign-in", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    apiFetch.mockResolvedValue(new Response(JSON.stringify({ message: "ok" }), { status: 200 }));
    const { wrapper, router } = await mountAuthView(apiFetch);

    await clickForgotPasswordLink(wrapper, router);
    await wrapper.find('input[type="email"]').setValue("rep@neosleepcare.com");
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    await flushPromises();

    expect(wrapper.text()).toContain(en["user.forgotPassword.successMessage"]);

    await vi.advanceTimersByTimeAsync(3100);
    expect(router.currentRoute.value.path).toBe("/login");

    vi.useRealTimers();
  });

  it("shows an error alert with a try-again action that returns to the form on failure", async () => {
    apiFetch.mockResolvedValue(new Response(JSON.stringify({ error: "Server error." }), { status: 500 }));
    const { wrapper, router } = await mountAuthView(apiFetch);

    await clickForgotPasswordLink(wrapper, router);
    await wrapper.find('input[type="email"]').setValue("rep@neosleepcare.com");
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    await flushPromises();

    expect(wrapper.text()).toContain(en["user.forgotPassword.error.network"]);
    const retryBtn = wrapper.findAll("button").find((b) => b.text() === en["user.forgotPassword.tryAgain"]);
    expect(retryBtn).toBeTruthy();

    await retryBtn!.trigger("click");
    await flushPromises();

    expect(wrapper.find('input[type="email"]').exists()).toBe(true);
    expect(wrapper.find("form").exists()).toBe(true);
  });
});

describe("AuthView — reset password (same persistent card and chrome)", () => {
  let apiFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    apiFetch = vi.fn();
  });

  it("validates the token on load and shows the new-password form when valid", async () => {
    apiFetch.mockResolvedValue(new Response(JSON.stringify({ valid: true }), { status: 200 }));
    const { wrapper } = await mountAuthView(apiFetch, "/reset-password?token=good-token");

    expect(apiFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/auth/reset-password/validate?token=good-token"),
      expect.anything(),
    );
    await vi.waitFor(() => {
      expect(wrapper.find('input[type="password"]').exists()).toBe(true);
    });
    expect(wrapper.text()).toContain(en["user.resetPassword.title"]);
  });

  it("shows the invalid-link message with a request-new-link action when the token doesn't validate", async () => {
    apiFetch.mockResolvedValue(new Response(JSON.stringify({ valid: false }), { status: 200 }));
    const { wrapper } = await mountAuthView(apiFetch, "/reset-password?token=bad-token");

    await vi.waitFor(() => {
      expect(wrapper.text()).toContain(en["user.resetPassword.error.invalidToken"]);
    });
    const link = wrapper.findAll("a").find((a) => a.text() === en["user.resetPassword.requestNewLink"]);
    expect(link).toBeTruthy();
    expect(link!.attributes("href")).toBe("/forgot-password");
  });

  it("submits the new password and redirects to /login on success", async () => {
    apiFetch.mockImplementation((path: string) => {
      if (path.includes("/validate")) {
        return Promise.resolve(new Response(JSON.stringify({ valid: true }), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }));
    });
    const { wrapper, router } = await mountAuthView(apiFetch, "/reset-password?token=good-token");

    await vi.waitFor(() => {
      expect(wrapper.findAll('input[type="password"]')).toHaveLength(2);
    });
    const passwordInputs = wrapper.findAll('input[type="password"]');
    await passwordInputs[0]!.setValue("newpassword123");
    await passwordInputs[1]!.setValue("newpassword123");
    await wrapper.find("form").trigger("submit");

    await vi.waitFor(() => {
      expect(router.currentRoute.value.path).toBe("/login");
    });
  });

  it("blocks submit when the confirm-password field doesn't match", async () => {
    apiFetch.mockImplementation((path: string) => {
      if (path.includes("/validate")) {
        return Promise.resolve(new Response(JSON.stringify({ valid: true }), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }));
    });
    const { wrapper } = await mountAuthView(apiFetch, "/reset-password?token=good-token");

    await vi.waitFor(() => {
      expect(wrapper.findAll('input[type="password"]')).toHaveLength(2);
    });
    const passwordInputs = wrapper.findAll('input[type="password"]');
    await passwordInputs[0]!.setValue("newpassword123");
    await passwordInputs[1]!.setValue("somethingelse");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(wrapper.text()).toContain(en["user.resetPassword.validation.passwordMismatch"]);
    expect(apiFetch).not.toHaveBeenCalledWith(
      "/api/v1/auth/reset-password",
      expect.anything(),
    );
  });

  it("keeps the same card and chrome mounted across /login → /reset-password (no remount)", async () => {
    const { wrapper, router } = await mountAuthView(apiFetch);
    const cardElBefore = wrapper.find(".auth-view__card").element;
    const logoElBefore = wrapper.find(".auth-chrome__logo-wrap").element;

    await router.push("/reset-password?token=abc");
    await flushPromises();

    expect(wrapper.find(".auth-view__card").element).toBe(cardElBefore);
    expect(wrapper.find(".auth-chrome__logo-wrap").element).toBe(logoElBefore);
  });
});
