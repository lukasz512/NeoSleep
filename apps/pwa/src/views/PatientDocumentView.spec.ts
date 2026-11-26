import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { setActivePinia, createPinia } from "pinia";
import { createVuetify } from "vuetify";
import { createRouter, createMemoryHistory } from "vue-router";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import en from "@i18n/en.json";

const apiFetch = vi.fn();
vi.mock("../composables/useApi", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

import PatientDocumentView from "./PatientDocumentView.vue";

const TOKEN = "A".repeat(43);

async function mountAt(hash: string) {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/d", component: PatientDocumentView }] });
  await router.push(`/d${hash}`);
  const wrapper = mount(PatientDocumentView, {
    global: { plugins: [createI18n({ legacy: false, locale: "en", messages: { en } }), createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives }), router] },
  });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  setActivePinia(createPinia());
  apiFetch.mockReset();
  URL.createObjectURL = vi.fn(() => "blob:hc");
  URL.revokeObjectURL = vi.fn();
});

describe("PatientDocumentView (NEO-258)", () => {
  it("fetches nothing until the patient taps Download, then posts the #fragment token and saves the PDF", async () => {
    apiFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "Content-Disposition": 'attachment; filename="historiaEndo-2026-10-06.pdf"' }),
      blob: async () => new Blob(["%PDF-"]),
    });
    const wrapper = await mountAt(`#${TOKEN}`);
    expect(apiFetch).not.toHaveBeenCalled();

    await wrapper.find("[data-testid=document-download]").trigger("click");
    await flushPromises();
    const [path, init] = apiFetch.mock.calls[0]!;
    expect(path).toBe("/api/v1/public/document");
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ token: TOKEN });
    expect(wrapper.find("[data-testid=document-done]").exists()).toBe(true);
  });

  it("an expired or unknown link (410) says so; no token at all says so without a request", async () => {
    apiFetch.mockResolvedValue({ ok: false, status: 410, headers: new Headers(), json: async () => ({ code: "LINK_INVALID" }) });
    const wrapper = await mountAt(`#${TOKEN}`);
    await wrapper.find("[data-testid=document-download]").trigger("click");
    await flushPromises();
    expect(wrapper.find("[data-testid=document-invalid]").text()).toContain("no longer valid");

    const empty = await mountAt("");
    expect(empty.find("[data-testid=document-invalid]").exists()).toBe(true);
  });
});
