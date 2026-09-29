import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import { createRouter, createMemoryHistory, type Router } from "vue-router";
import en from "@i18n/en.json";
import { ApiError } from "@api";
import {
  BRAND_PWA_BADGE_URL,
  BRAND_PWA_BADGE_DARK_URL,
  BRAND_LOGO_LIGHT_URL,
  BRAND_LOGO_DARK_URL,
} from "@brand/logos";
import { useThemeStore, APP_VERSION_KEY, type AppVersionInfo } from "@stores";
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
  appVersion?: AppVersionInfo,
  notify: ReturnType<typeof vi.fn> = vi.fn(),
): Promise<{ wrapper: VueWrapper; router: Router; notify: ReturnType<typeof vi.fn> }> {
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
      provide: {
        "neo:apiFetch": apiFetch,
        "neo:notify": notify,
        ...(appVersion ? { [APP_VERSION_KEY as symbol]: appVersion } : {}),
      },
    },
  });
  mountedWrappers.push(wrapper);
  await flushPromises();
  return { wrapper, router, notify };
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

const summaryBox = (wrapper: VueWrapper) => wrapper.find('[data-testid="form-error-summary"]');

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

  it("renders the 'Remember me' checkbox in the app's primary brand color, not Vuetify's unthemed default", async () => {
    const { wrapper } = await mountAuthView(apiFetch);

    // VSelectionControl only applies the `color` prop's `text-<color>` class
    // once checked (textColorClasses is `model.value ? props.color :
    // props.baseColor`) — an unchecked box carries no color class either
    // way, so this must check the box to actually exercise the prop.
    const checkboxInput = wrapper.find('input[type="checkbox"]');
    await checkboxInput.setValue(true);
    const wrapperEl = checkboxInput.element.closest(".v-selection-control")!.querySelector(".v-selection-control__wrapper")!;
    expect(Array.from(wrapperEl.classList)).toContain("text-primary");
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

  // NEO-109: every form lists its errors in a summary box on top — only after the first submit.
  it("lists both field errors in the summary box after the first submit, each one a link to its field", async () => {
    const { wrapper } = await mountAuthView(apiFetch);
    expect(summaryBox(wrapper).exists()).toBe(false);

    await wrapper.find("form").trigger("submit");
    await flushPromises();
    await flushPromises();

    const links = summaryBox(wrapper).findAll("button");
    expect(links).toHaveLength(2);
    expect(links[0]!.text()).toContain(en["user.login.validation.emailRequired"]);
    expect(links[1]!.text()).toContain(en["user.login.validation.passwordRequired"]);

    await links[1]!.trigger("click");
    expect(document.activeElement).toBe(wrapper.find('input[type="password"]').element);

    await wrapper.find('input[type="email"]').setValue("rep@neosleepcare.com");
    await wrapper.find('input[type="password"]').setValue("correcthorse");
    await flushPromises();
    expect(summaryBox(wrapper).exists()).toBe(false);
  });

  it("marks the field the API names in a 400 VALIDATION_ERROR, under it and in the summary", async () => {
    apiFetch.mockResolvedValue(
      new Response(JSON.stringify({ error: "Email and password are required.", code: "VALIDATION_ERROR", field: "password", reason: "required" }), { status: 400 }),
    );
    const { wrapper, notify } = await mountAuthView(apiFetch);

    await fillAndSubmit(wrapper, "rep@neosleepcare.com", "correcthorse");

    const link = summaryBox(wrapper).find("button");
    expect(link.text()).toContain(en["user.login.password"]);
    expect(link.text()).toContain(en["app.formRenderer.validation.required"]);
    expect(notify).not.toHaveBeenCalled();
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

  // NEO-109: the sign-in error is in the form again, never a toast.
  it("shows the invalid-credentials message as a form-level line in the summary box on a 401, not a toast", async () => {
    apiFetch.mockResolvedValue(new Response(JSON.stringify({ error: "Invalid email or password." }), { status: 401 }));
    const { wrapper, notify } = await mountAuthView(apiFetch);

    await fillAndSubmit(wrapper, "rep@neosleepcare.com", "wrongpassword");

    const box = summaryBox(wrapper);
    expect(box.text()).toContain(en["user.login.error.invalidCredentials"]);
    // Key-less line: plain text, not a link to a field.
    expect(box.find("button").exists()).toBe(false);
    expect(notify).not.toHaveBeenCalled();
  });

  it("shows the too-many-attempts message in the summary box on a 429 response", async () => {
    apiFetch.mockResolvedValue(new Response(JSON.stringify({ error: "Too many login attempts." }), { status: 429 }));
    const { wrapper, notify } = await mountAuthView(apiFetch);

    await fillAndSubmit(wrapper, "rep@neosleepcare.com", "correcthorse");

    expect(summaryBox(wrapper).text()).toContain(en["user.login.error.tooManyAttempts"]);
    expect(notify).not.toHaveBeenCalled();
  });

  // NEO-81: a 5xx is "a problem on our side", not a vague "something went wrong".
  it("says the problem is on our side on a 5xx response", async () => {
    apiFetch.mockResolvedValue(new Response(JSON.stringify({ error: "Server error." }), { status: 500 }));
    const { wrapper, notify } = await mountAuthView(apiFetch);

    await fillAndSubmit(wrapper, "rep@neosleepcare.com", "correcthorse");

    expect(notify).toHaveBeenCalledWith(en["common.error.server.body"], "error", "common.error.server.body");
  });

  it("keeps the generic sign-in message, in the summary box, for an unexpected 4xx naming no field", async () => {
    apiFetch.mockResolvedValue(new Response(JSON.stringify({ error: "Bad request." }), { status: 400 }));
    const { wrapper, notify } = await mountAuthView(apiFetch);

    await fillAndSubmit(wrapper, "rep@neosleepcare.com", "correcthorse");

    expect(summaryBox(wrapper).text()).toContain(en["user.login.error.network"]);
    expect(notify).not.toHaveBeenCalled();
  });

  it("says to check the connection when the request never reached the server", async () => {
    apiFetch.mockRejectedValue(new ApiError({ kind: "network", message: "Failed to fetch" }));
    const { wrapper, notify } = await mountAuthView(apiFetch);

    await fillAndSubmit(wrapper, "rep@neosleepcare.com", "correcthorse");

    expect(notify).toHaveBeenCalledWith(en["common.error.network.body"], "error", "common.error.network.body");
  });

  it("shows a generic network error message via the native notification when the request throws", async () => {
    apiFetch.mockRejectedValue(new TypeError("Failed to fetch"));
    const { wrapper, notify } = await mountAuthView(apiFetch);

    await fillAndSubmit(wrapper, "rep@neosleepcare.com", "correcthorse");

    expect(notify).toHaveBeenCalledWith(
      en["user.login.error.network"],
      "error",
      "user.login.error.network",
    );
  });

  it("fires a fresh notification for a second consecutive connection failure with the same error key", async () => {
    apiFetch.mockRejectedValue(new ApiError({ kind: "network", message: "Failed to fetch" }));
    const { wrapper, notify } = await mountAuthView(apiFetch);

    await fillAndSubmit(wrapper, "rep@neosleepcare.com", "correcthorse");
    await fillAndSubmit(wrapper, "rep@neosleepcare.com", "correcthorse2");

    expect(notify).toHaveBeenCalledTimes(2);
    expect(summaryBox(wrapper).exists()).toBe(false);
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

  it("keeps the form open and shows a server failure as a toast (nothing in the form can fix it)", async () => {
    apiFetch.mockResolvedValue(new Response(JSON.stringify({ error: "Server error." }), { status: 500 }));
    const { wrapper, router, notify } = await mountAuthView(apiFetch);

    await clickForgotPasswordLink(wrapper, router);
    await wrapper.find('input[type="email"]').setValue("rep@neosleepcare.com");
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    await flushPromises();

    expect(notify).toHaveBeenCalledWith(en["common.error.server.body"], "error", "common.error.server.body");
    expect(wrapper.find('input[type="email"]').exists()).toBe(true);
    expect(wrapper.text()).not.toContain(en["user.forgotPassword.successMessage"]);
    expect(summaryBox(wrapper).exists()).toBe(false);
  });

  it("marks the email field when the API rejects it (400 VALIDATION_ERROR)", async () => {
    apiFetch.mockResolvedValue(
      new Response(JSON.stringify({ error: "Email is required.", code: "VALIDATION_ERROR", field: "email", reason: "required" }), { status: 400 }),
    );
    const { wrapper, router, notify } = await mountAuthView(apiFetch);

    await clickForgotPasswordLink(wrapper, router);
    await wrapper.find('input[type="email"]').setValue("rep@neosleepcare.com");
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    await flushPromises();

    const link = summaryBox(wrapper).find("button");
    expect(link.text()).toContain(en["app.formRenderer.validation.required"]);
    expect(notify).not.toHaveBeenCalled();
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

  it("shows an expired/used link as a form-level line in the summary box, not an alert or toast", async () => {
    apiFetch.mockImplementation((path: string) => {
      if (path.includes("/validate")) {
        return Promise.resolve(new Response(JSON.stringify({ valid: true }), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ error: "Invalid or expired reset link. Request a new one." }), { status: 400 }));
    });
    const { wrapper, notify } = await mountAuthView(apiFetch, "/reset-password?token=good-token");

    await vi.waitFor(() => {
      expect(wrapper.findAll('input[type="password"]')).toHaveLength(2);
    });
    const passwordInputs = wrapper.findAll('input[type="password"]');
    await passwordInputs[0]!.setValue("newpassword123");
    await passwordInputs[1]!.setValue("newpassword123");
    await wrapper.find("form").trigger("submit");

    await vi.waitFor(() => {
      expect(summaryBox(wrapper).exists()).toBe(true);
    });
    expect(summaryBox(wrapper).text()).toContain(en["user.resetPassword.error.invalidToken"].split("\n")[0]!);
    expect(notify).not.toHaveBeenCalled();
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

describe("AuthView — PWA badge follows the theme (NEO-12)", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("shows the white badge in light mode and the dark badge in dark mode, switching live", async () => {
    const { wrapper } = await mountAuthView(vi.fn());
    const themeStore = useThemeStore();
    const badge = () => wrapper.find(".auth-view__pwa-badge").attributes("src");

    themeStore.setPreference("light");
    await flushPromises();
    expect(badge()).toBe(BRAND_PWA_BADGE_URL);

    themeStore.setPreference("dark");
    await flushPromises();
    expect(badge()).toBe(BRAND_PWA_BADGE_DARK_URL);
  });

  it("shows the white wordmark in light mode and the dark-ink one in dark mode, with the halo switched to match", async () => {
    const { wrapper } = await mountAuthView(vi.fn());
    const themeStore = useThemeStore();
    const logo = () => wrapper.find(".auth-chrome__logo").attributes("src");
    const halo = () => wrapper.find(".auth-chrome__halo .auth-halo").classes();

    themeStore.setPreference("light");
    await flushPromises();
    expect(logo()).toBe(BRAND_LOGO_DARK_URL); // logo_dark.svg = white wordmark
    expect(halo()).not.toContain("auth-halo--dark");

    themeStore.setPreference("dark");
    await flushPromises();
    expect(logo()).toBe(BRAND_LOGO_LIGHT_URL); // logo_light.svg = dark-ink wordmark
    expect(halo()).toContain("auth-halo--dark");
  });

  it("puts the same halo, at half size, behind the PWA badge and switches it with the theme", async () => {
    const { wrapper } = await mountAuthView(vi.fn());
    const themeStore = useThemeStore();
    const halo = () => wrapper.find(".auth-view__pwa-badge-halo .auth-halo").classes();

    themeStore.setPreference("light");
    await flushPromises();
    expect(halo()).toContain("auth-halo--sm");
    expect(halo()).not.toContain("auth-halo--dark");

    themeStore.setPreference("dark");
    await flushPromises();
    expect(halo()).toContain("auth-halo--dark");
  });
});

describe("AuthView — app version under the badge (NEO-12)", () => {
  afterEach(() => {
    localStorage.clear();
  });

  const versionText = (wrapper: VueWrapper) => wrapper.find(".auth-view__app-version");

  it("shows version and build number with no suffix on prod", async () => {
    const { wrapper } = await mountAuthView(vi.fn(), "/login", { version: "1.0.0", build: 12, channel: "prod" });
    expect(versionText(wrapper).text()).toBe("Version 1.0.0 (build 12)");
  });

  it("marks dev deploys with a DEV suffix", async () => {
    const { wrapper } = await mountAuthView(vi.fn(), "/login", { version: "1.0.0", build: 3, channel: "dev" });
    expect(versionText(wrapper).text()).toBe("Version 1.0.0 (build 3) · DEV");
  });

  it("shows a local build without a build number", async () => {
    const { wrapper } = await mountAuthView(vi.fn(), "/login", { version: "1.0.0", build: null, channel: "local" });
    expect(versionText(wrapper).text()).toBe("Version 1.0.0 · LOCAL");
  });

  it("renders nothing when the app provides no version", async () => {
    const { wrapper } = await mountAuthView(vi.fn());
    expect(versionText(wrapper).exists()).toBe(false);
  });

  it("uses the dark-ink style in dark mode and the white style in light mode, like the badge", async () => {
    const { wrapper } = await mountAuthView(vi.fn(), "/login", { version: "1.0.0", build: 1, channel: "prod" });
    const themeStore = useThemeStore();

    themeStore.setPreference("light");
    await flushPromises();
    expect(versionText(wrapper).classes()).not.toContain("auth-view__app-version--dark");

    themeStore.setPreference("dark");
    await flushPromises();
    expect(versionText(wrapper).classes()).toContain("auth-view__app-version--dark");
  });
});
