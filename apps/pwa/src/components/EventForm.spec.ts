import { describe, it, expect, vi, afterEach } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import en from "@i18n/en.json";
import EventForm from "./EventForm.vue";
import type { EventSubmitPayload } from "./EventForm.types";
import type { SubmitDone } from "../composables/useEntitySubmit";

const apiFetch = vi.fn();
vi.mock("../composables/useApi", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));
const notify = vi.fn();
vi.mock("../composables/useNotifications", () => ({ useNotifications: () => ({ show: notify }) }));

const wrappers: VueWrapper[] = [];
afterEach(() => {
  for (const w of wrappers.splice(0)) w.unmount();
  apiFetch.mockReset();
  notify.mockReset();
  document.body.innerHTML = "";
});

/** Mounts the dialog open with a valid event; `reply` is what the host's save handler answers. */
async function openWith(reply: (done: SubmitDone) => void) {
  setActivePinia(createPinia());
  apiFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ items: [] }) } as Response);
  const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
  const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });
  const wrapper = mount(EventForm, {
    props: {
      modelValue: false,
      onSubmit: (_payload: EventSubmitPayload, done: SubmitDone) => reply(done),
    },
    global: { plugins: [i18n, vuetify] },
    attachTo: document.body,
  });
  wrappers.push(wrapper);
  // The form seeds itself on the closed → open transition.
  await wrapper.setProps({
    modelValue: true,
    initialData: { title: "Visit", start_at: "2031-09-10T16:00:00.000Z", end_at: "2031-09-10T17:00:00.000Z" },
  });
  await flushPromises();
  return wrapper;
}

function clickSave() {
  const save = [...document.body.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.includes("Add event"));
  save!.click();
}

describe("EventForm errors (NEO-109)", () => {
  it("a 400 naming a payload key marks the form field it maps to — summary, no toast, dialog stays open", async () => {
    const wrapper = await openWith((done) => done(false, { type: "invalid" }));
    clickSave();
    await flushPromises();

    const summary = document.body.querySelector('[data-testid="form-error-summary"]');
    expect(summary?.textContent).toContain("Fields to fix: 1");
    expect(summary?.textContent).toContain("Type — Check this field");
    expect(notify).not.toHaveBeenCalled();
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
  });

  it("maps API keys to form keys (start_at → Start)", async () => {
    await openWith((done) => done(false, { start_at: "required" }));
    clickSave();
    await flushPromises();

    expect(document.body.querySelector('[data-testid="form-error-summary"]')?.textContent).toContain("Start");
  });

  it("a 400 naming a field the form doesn't show falls back to a toast", async () => {
    await openWith((done) => done(false, { attendees: "invalid" }));
    clickSave();
    await flushPromises();

    expect(document.body.querySelector('[data-testid="form-error-summary"]')).toBeNull();
    expect(notify).toHaveBeenCalledWith("Could not save — check the form data", "error", undefined, expect.anything());
  });

  it("a plain failure leaves the toast to the host — nothing marked", async () => {
    const wrapper = await openWith((done) => done(false));
    clickSave();
    await flushPromises();

    expect(document.body.querySelector('[data-testid="form-error-summary"]')).toBeNull();
    expect(notify).not.toHaveBeenCalled();
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
  });
});
