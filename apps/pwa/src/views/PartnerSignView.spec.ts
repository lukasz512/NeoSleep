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

import PartnerSignView from "./PartnerSignView.vue";

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
  const wrapper = mount(PartnerSignView, { global: { plugins: [i18n, vuetify] }, attachTo: document.body });
  mounted.push(wrapper);
  await flushPromises();
  return wrapper;
}

function buttonByText(text: string): HTMLButtonElement | undefined {
  return Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.trim() === text);
}

describe("PartnerSignView (CORE-166)", () => {
  it("reads the token from the #fragment, names the signer, and sends the signature", async () => {
    apiFetch.mockImplementation(async (url: string) =>
      url.startsWith("/api/v1/invite/sign-handoff?")
        ? json(200, { status: "pending", firstName: "Ana", lastName: "Ruiz", versionLabel: "2.1" })
        : json(200, { success: true }),
    );
    await mountView();

    expect(apiFetch.mock.calls[0]![0]).toBe("/api/v1/invite/sign-handoff?h=qr-token");
    expect(document.body.textContent).toContain("Ana Ruiz");
    expect(document.body.textContent).toContain("2.1");

    buttonByText(en["user.partnerSign.send"])!.click();
    await flushPromises();

    const [url, init] = apiFetch.mock.calls[1]!;
    expect(url).toBe("/api/v1/invite/sign-handoff/sign");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ h: "qr-token", signatureDataUrl: SIGNATURE });
    expect(document.body.textContent).toContain(en["user.partnerSign.sentTitle"]);
  });

  it("shows the expired state for an unknown or used code, and when sending finds it expired", async () => {
    apiFetch.mockResolvedValue(json(404, {}));
    await mountView();
    expect(document.body.textContent).toContain(en["user.partnerSign.expiredTitle"]);
    expect(buttonByText(en["user.partnerSign.send"])).toBeUndefined();
  });

  it("a code expiring between scan and send shows the expired state", async () => {
    apiFetch.mockImplementation(async (url: string) =>
      url.startsWith("/api/v1/invite/sign-handoff?")
        ? json(200, { status: "pending", firstName: "Ana", lastName: "Ruiz", versionLabel: "2.1" })
        : json(404, {}),
    );
    await mountView();
    buttonByText(en["user.partnerSign.send"])!.click();
    await flushPromises();
    expect(document.body.textContent).toContain(en["user.partnerSign.expiredTitle"]);
  });

  it("no token in the link → expired, nothing requested", async () => {
    route.hash = "";
    await mountView();
    expect(apiFetch).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain(en["user.partnerSign.expiredTitle"]);
  });
});
