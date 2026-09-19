import { describe, it, expect, vi, afterEach } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
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

import PatientEndoIntakePanel from "./PatientEndoIntakePanel.vue";

function jsonResponse(ok: boolean, status: number, body: unknown) {
  return { ok, status, json: async () => body } as Response;
}

const mountedWrappers: VueWrapper[] = [];
afterEach(() => {
  for (const w of mountedWrappers.splice(0)) w.unmount();
  apiFetch.mockReset();
  notify.mockReset();
});

function mountPanel(): VueWrapper {
  setActivePinia(createPinia());
  const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
  const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });
  const wrapper = mount(PatientEndoIntakePanel, { props: { patientId: "patient-1" }, global: { plugins: [i18n, vuetify] } });
  mountedWrappers.push(wrapper);
  return wrapper;
}

describe("PatientEndoIntakePanel", () => {
  it("loads existing checklist answers from the API", async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse(true, 200, { has_diabetes: true, skeletal_class: "II" }));
    const wrapper = mountPanel();

    await vi.waitFor(() => expect(wrapper.text()).toContain("Diabetes"));
    expect(apiFetch).toHaveBeenCalledWith("/api/v1/patient/patient-1/endo-intake", { handleErrors: false });
  });

  it("saves the checklist via PUT", async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse(true, 200, null));
    const wrapper = mountPanel();
    // Poll the rendered Save button, not the mock's call count: apiFetch is
    // invoked synchronously during mount (before res.json()/loading=false
    // resolve), so a call-count check alone can race ahead of the DOM
    // actually reflecting the loaded state (same fix as
    // EntityDocumentsPanel.spec.ts's own comment).
    await vi.waitFor(() => expect(wrapper.findAll("button").find((b) => b.text() === "Save")).toBeTruthy());

    apiFetch.mockResolvedValueOnce(jsonResponse(true, 200, { has_diabetes: true }));
    const saveButton = wrapper.findAll("button").find((b) => b.text() === "Save");
    await saveButton?.trigger("click");

    await vi.waitFor(() => expect(notify).toHaveBeenCalledWith("Saved", "success"));
    const [url, options] = apiFetch.mock.calls[1]!;
    expect(url).toBe("/api/v1/patient/patient-1/endo-intake");
    expect((options as RequestInit).method).toBe("PUT");
  });

  it("generates a PDF via the generate-pdf endpoint", async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse(true, 200, null));
    const wrapper = mountPanel();
    await vi.waitFor(() => expect(wrapper.findAll("button").find((b) => b.text() === "Generate PDF")).toBeTruthy());

    apiFetch.mockResolvedValueOnce(jsonResponse(true, 200, { id: "fa-1" }));
    const pdfButton = wrapper.findAll("button").find((b) => b.text() === "Generate PDF");
    await pdfButton?.trigger("click");

    await vi.waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
    expect(apiFetch).toHaveBeenNthCalledWith(2, "/api/v1/patient/patient-1/endo-intake/generate-pdf", { method: "POST" });
  });
});
