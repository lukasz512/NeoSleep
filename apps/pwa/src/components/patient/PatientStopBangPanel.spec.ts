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

import PatientStopBangPanel from "./PatientStopBangPanel.vue";

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
  const wrapper = mount(PatientStopBangPanel, { props: { patientId: "patient-1" }, global: { plugins: [i18n, vuetify] } });
  mountedWrappers.push(wrapper);
  return wrapper;
}

describe("PatientStopBangPanel", () => {
  it("shows the empty state when no screenings exist yet", async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse(true, 200, []));
    const wrapper = mountPanel();

    await vi.waitFor(() => expect(wrapper.text()).toContain("No screenings recorded yet."));
  });

  it("lists past screenings with their score", async () => {
    apiFetch.mockResolvedValueOnce(
      jsonResponse(true, 200, [{ id: "s1", score: 5, created_at: "2026-09-01T10:00:00.000Z" }])
    );
    const wrapper = mountPanel();

    await vi.waitFor(() => expect(wrapper.text()).toContain("5/8"));
  });

  it("the Record button stays disabled until every question is answered", async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse(true, 200, []));
    const wrapper = mountPanel();
    await vi.waitFor(() => expect(wrapper.findAll("button").find((b) => b.text() === "Record Screening")).toBeTruthy());

    const recordButton = wrapper.findAll("button").find((b) => b.text() === "Record Screening");
    expect(recordButton?.attributes("disabled")).toBeDefined();
  });

  it("records a screening once all 8 questions are answered, then reloads the list", async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse(true, 200, []));
    const wrapper = mountPanel();
    await vi.waitFor(() => expect(wrapper.findAll("button").find((b) => b.text() === "Record Screening")).toBeTruthy());

    // Answer all 8 questions "No" (first VBtnToggle option is "Yes", second is "No" — click the "No" in each row).
    const noButtons = wrapper.findAll(".stop-bang__row button").filter((b) => b.text() === "No");
    expect(noButtons).toHaveLength(8);
    for (const btn of noButtons) await btn.trigger("click");
    await wrapper.vm.$nextTick();

    apiFetch.mockResolvedValueOnce(jsonResponse(true, 201, { id: "s2", score: 0 }));
    apiFetch.mockResolvedValueOnce(jsonResponse(true, 200, [{ id: "s2", score: 0, created_at: "2026-09-16T10:00:00.000Z" }]));

    const recordButton = wrapper.findAll("button").find((b) => b.text() === "Record Screening");
    expect(recordButton?.attributes("disabled")).toBeUndefined();
    await recordButton?.trigger("click");

    await vi.waitFor(() => expect(notify).toHaveBeenCalledWith("Screening recorded", "success"));
    const [url, options] = apiFetch.mock.calls[1]!;
    expect(url).toBe("/api/v1/patient/patient-1/stop-bang");
    expect((options as RequestInit).method).toBe("POST");
    const body = JSON.parse((options as RequestInit).body as string);
    expect(body.snoring).toBe(false);
  });
});
