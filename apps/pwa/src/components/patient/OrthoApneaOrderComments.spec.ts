import { describe, it, expect, vi, afterEach } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import en from "@i18n/en.json";

const apiFetch = vi.fn();
vi.mock("../../composables/useApi", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

const notify = vi.fn();
vi.mock("../../composables/useNotifications", () => ({ useNotifications: () => ({ show: notify }) }));

import OrthoApneaOrderComments from "./OrthoApneaOrderComments.vue";

function jsonResponse(ok: boolean, body: unknown) {
  return { ok, json: async () => body } as Response;
}

const mountedWrappers: VueWrapper[] = [];
afterEach(() => {
  for (const w of mountedWrappers.splice(0)) w.unmount();
  apiFetch.mockReset();
  notify.mockReset();
});

function mountComments(): VueWrapper {
  setActivePinia(createPinia());
  const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
  const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });
  const wrapper = mount(OrthoApneaOrderComments, {
    props: { treatmentPlanId: "plan-1" },
    global: { plugins: [i18n, vuetify] },
  });
  mountedWrappers.push(wrapper);
  return wrapper;
}

/**
 * VCheckbox only renders its `color` prop's `text-<color>` class on the
 * `.v-selection-control__wrapper` element once checked (Vuetify's
 * VSelectionControl: textColorClasses is `model.value ? props.color :
 * props.baseColor`) — an unchecked box carries no color class either way,
 * so this must check first to actually exercise the prop.
 */
async function checkboxColorClasses(wrapper: VueWrapper): Promise<string[]> {
  const checkboxInput = wrapper.find('input[type="checkbox"]');
  await checkboxInput.setValue(true);
  const wrapperEl = checkboxInput.element.closest(".v-selection-control")!.querySelector(".v-selection-control__wrapper")!;
  return Array.from(wrapperEl.classList);
}

describe("OrthoApneaOrderComments — checkbox styling (NEO-11)", () => {
  it("renders the empty state before any comment is loaded", () => {
    const wrapper = mountComments();
    expect(wrapper.text()).toContain(en["app.notes.empty"]);
  });

  it("does not show the notify-OrthoApnea warning until the checkbox is checked", () => {
    const wrapper = mountComments();
    expect(wrapper.text()).not.toContain(en["app.orthoApneaOrder.comments.notifyWarning"]);
  });

  it("renders the notify-OrthoApnea checkbox in the app's primary brand color, not Vuetify's unthemed default", async () => {
    const wrapper = mountComments();
    expect(await checkboxColorClasses(wrapper)).toContain("text-primary");
  });

  it("shows the notify warning once checked, and sends notifyOrthoApnea: true when a comment is added", async () => {
    const wrapper = mountComments();

    await wrapper.find('input[type="checkbox"]').setValue(true);
    expect(wrapper.text()).toContain(en["app.orthoApneaOrder.comments.notifyWarning"]);

    await wrapper.find("textarea").setValue("Please redesign the splint.");

    apiFetch.mockResolvedValueOnce(jsonResponse(true, {}));
    apiFetch.mockResolvedValueOnce(jsonResponse(true, { items: [] }));

    const addButton = wrapper.findAll("button").find((b) => b.text() === en["app.notes.add"]);
    await addButton!.trigger("click");
    await flushPromises();

    const [url, options] = apiFetch.mock.calls[0]!;
    expect(url).toBe("/api/v1/partners/orthoapnea/treatments/plan-1/comments");
    const body = JSON.parse((options as RequestInit).body as string);
    expect(body).toEqual({ body: "Please redesign the splint.", notifyOrthoApnea: true });
  });
});
