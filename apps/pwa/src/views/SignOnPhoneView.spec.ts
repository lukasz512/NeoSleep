import { describe, it, expect, vi, afterEach } from "vitest";
import { defineComponent } from "vue";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import en from "@i18n/en.json";

const apiFetch = vi.fn();
vi.mock("../composables/useApi", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

const route = { hash: "#qr-token" };
vi.mock("vue-router", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useRoute: () => route,
}));

const SIGNATURE = "data:image/png;base64,iVBORw0KGgo=";
// The signature sheet itself is ConsentSignatureField's own spec; here it is a field that already holds a signature.
vi.mock("../components/questionnaire/ConsentSignatureField.vue", () => ({
  default: defineComponent({
    emits: ["change"],
    mounted() {
      this.$emit("change", false);
    },
    methods: {
      toDataURL: () => SIGNATURE,
      isEmpty: () => false,
    },
    template: "<div class='signature-stub' />",
  }),
}));

import SignOnPhoneView from "./SignOnPhoneView.vue";

function json(status: number, body: unknown): Response {
  return { ok: status < 400, status, json: async () => body } as Response;
}

const mounted: VueWrapper[] = [];
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount();
  apiFetch.mockReset();
  route.hash = "#qr-token";
});

async function mountView() {
  setActivePinia(createPinia());
  const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
  const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });
  const wrapper = mount(SignOnPhoneView, { global: { plugins: [i18n, vuetify] }, attachTo: document.body });
  mounted.push(wrapper);
  await flushPromises();
  return wrapper;
}

function buttonByText(text: string): HTMLButtonElement | undefined {
  return Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.trim() === text);
}

const PENDING = { status: "pending", purpose: "partner_agreement", signerName: "Ana Ruiz", versionLabel: "2.1" };

/** Lookup answered with `view`, sign answered with `signStatus`. */
function routeApi(view: unknown, signStatus = 200) {
  apiFetch.mockImplementation(async (url: string) =>
    url === "/api/v1/public/signature-handoff/lookup" ? json(view ? 200 : 404, view ?? {}) : json(signStatus, { success: signStatus < 400 }),
  );
}

function bodyOf(call: unknown[] | undefined): unknown {
  return JSON.parse((call![1] as RequestInit).body as string);
}

describe("SignOnPhoneView — the page the QR opens (CORE-166, CORE-172)", () => {
  it("reads the token from the #fragment, sends it in a POST body, names the signer, and sends the signature", async () => {
    routeApi(PENDING);
    await mountView();

    expect(apiFetch.mock.calls[0]![0]).toBe("/api/v1/public/signature-handoff/lookup");
    expect(bodyOf(apiFetch.mock.calls[0])).toEqual({ h: "qr-token" });
    expect(document.body.textContent).toContain("Ana Ruiz");
    expect(document.body.textContent).toContain("2.1");

    buttonByText(en["app.signOnPhone.send"])!.click();
    await flushPromises();

    expect(apiFetch.mock.calls[1]![0]).toBe("/api/v1/public/signature-handoff/sign");
    expect(bodyOf(apiFetch.mock.calls[1])).toEqual({ h: "qr-token", signatureDataUrl: SIGNATURE });
    expect(document.body.textContent).toContain(en["app.signOnPhone.sentTitle"]);
  });

  it.each([
    ["patient_consent", "app.signOnPhone.intro.patientConsent"],
    ["doctor_print", "app.signOnPhone.intro.doctorPrint"],
  ] as const)("says what is being signed for %s", async (purpose, key) => {
    routeApi({ ...PENDING, purpose, signerName: "Lucía S.", versionLabel: null });
    await mountView();
    expect(document.body.textContent).toContain(en[key].replace("{name}", "Lucía S."));
  });

  it("shows the expired state for an unknown or used code", async () => {
    routeApi(null);
    await mountView();
    expect(document.body.textContent).toContain(en["app.signOnPhone.expiredTitle"]);
    expect(buttonByText(en["app.signOnPhone.send"])).toBeUndefined();
  });

  it("a code expiring between scan and send shows the expired state", async () => {
    routeApi(PENDING, 404);
    await mountView();
    buttonByText(en["app.signOnPhone.send"])!.click();
    await flushPromises();
    expect(document.body.textContent).toContain(en["app.signOnPhone.expiredTitle"]);
  });

  it("no token in the link → expired, nothing requested", async () => {
    route.hash = "";
    await mountView();
    expect(apiFetch).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain(en["app.signOnPhone.expiredTitle"]);
  });
});
