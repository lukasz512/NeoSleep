import { describe, it, expect, vi, afterEach } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import { createRouter, createMemoryHistory } from "vue-router";
import en from "@i18n/en.json";
import ChangePasswordView from "./ChangePasswordView.vue";

// NEO-109: the change-password form shows its errors in the form (under the
// field + a summary box on top); only connection/server failures are toasts.

const STUB_ROUTE = { template: "<div/>" };
const mounted: VueWrapper[] = [];

afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount();
  document.body.innerHTML = "";
});

async function mountView(apiFetch: ReturnType<typeof vi.fn>) {
  setActivePinia(createPinia());
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/change-password", component: STUB_ROUTE },
      { path: "/dashboard", component: STUB_ROUTE },
    ],
  });
  await router.push("/change-password");
  await router.isReady();
  const notify = vi.fn();
  const el = document.createElement("div");
  document.body.appendChild(el);
  const wrapper = mount(ChangePasswordView, {
    attachTo: el,
    global: {
      plugins: [
        createI18n({ legacy: false, locale: "en", messages: { en } }),
        createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives }),
        router,
      ],
      provide: { "neo:apiFetch": apiFetch, "neo:notify": notify },
    },
  });
  mounted.push(wrapper);
  await flushPromises();
  return { wrapper, router, notify };
}

async function fillAndSubmit(wrapper: VueWrapper, current: string, next: string) {
  const inputs = wrapper.findAll('input[type="password"]');
  await inputs[0]!.setValue(current);
  await inputs[1]!.setValue(next);
  await wrapper.find("form").trigger("submit");
  await flushPromises();
  await flushPromises();
}

const summaryBox = (w: VueWrapper) => w.find('[data-testid="form-error-summary"]');

describe("ChangePasswordView — errors in the form (NEO-109)", () => {
  it("shows no summary before the first submit, then lists the field errors", async () => {
    const apiFetch = vi.fn();
    const { wrapper } = await mountView(apiFetch);
    expect(summaryBox(wrapper).exists()).toBe(false);

    await fillAndSubmit(wrapper, "", "short");

    const links = summaryBox(wrapper).findAll("button");
    expect(links).toHaveLength(2);
    expect(links[0]!.text()).toContain(en["user.changePassword.validation.passwordRequired"]);
    expect(links[1]!.text()).toContain(en["user.changePassword.validation.passwordTooShort"]);
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("marks a wrong current password on that field and in the summary, not as a toast", async () => {
    const apiFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Current password is incorrect." }), { status: 401 }));
    const { wrapper, notify } = await mountView(apiFetch);

    await fillAndSubmit(wrapper, "wrong-current", "a-long-new-password");

    const link = summaryBox(wrapper).find("button");
    expect(link.text()).toContain(en["user.changePassword.currentPassword"]);
    expect(link.text()).toContain(en["user.changePassword.error.incorrectCurrent"]);
    const currentField = wrapper.find('[data-field="current_password"]');
    expect(currentField.text()).toContain(en["user.changePassword.error.incorrectCurrent"]);
    expect(notify).not.toHaveBeenCalled();

    // Editing the field clears the API's verdict.
    await wrapper.findAll('input[type="password"]')[0]!.setValue("another-try");
    await flushPromises();
    expect(summaryBox(wrapper).exists()).toBe(false);
  });

  it("marks the field a 400 VALIDATION_ERROR names", async () => {
    const apiFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ error: "New password must be at least 8 characters.", code: "VALIDATION_ERROR", field: "new_password", reason: "invalid" }),
        { status: 400 },
      ),
    );
    const { wrapper, notify } = await mountView(apiFetch);

    await fillAndSubmit(wrapper, "current-password", "a-long-new-password");

    const link = summaryBox(wrapper).find("button");
    expect(link.text()).toContain(en["user.changePassword.newPassword"]);
    expect(link.text()).toContain(en["app.formRenderer.validation.invalid"]);
    expect(notify).not.toHaveBeenCalled();
  });

  it("shows a server failure as a toast, with nothing in the form", async () => {
    const apiFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Server error." }), { status: 500 }));
    const { wrapper, notify } = await mountView(apiFetch);

    await fillAndSubmit(wrapper, "current-password", "a-long-new-password");

    expect(notify).toHaveBeenCalledWith(en["common.error.server.body"], "error", "common.error.server.body");
    expect(summaryBox(wrapper).exists()).toBe(false);
  });
});
