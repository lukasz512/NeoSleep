import { describe, it, expect, afterEach } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createRouter, createMemoryHistory } from "vue-router";
import en from "@i18n/en.json";
import PatientNextStep from "./PatientNextStep.vue";
import type { PatientIntakeFormStatus } from "../../types/patientIntakeForm";

const mountedWrappers: VueWrapper[] = [];
afterEach(() => {
  for (const w of mountedWrappers.splice(0)) w.unmount();
});

function makeRouter() {
  const Blank = { template: "<div />" };
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/patients", name: "patients", component: Blank },
      { path: "/patients/:id", name: "patient-detail", component: Blank },
    ],
  });
}

async function mountNextStep(forms: PatientIntakeFormStatus[], compact = false) {
  const router = makeRouter();
  await router.push("/patients");
  const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
  const wrapper = mount(PatientNextStep, { props: { patientId: "p-1", forms, compact }, global: { plugins: [i18n, router] } });
  mountedWrappers.push(wrapper);
  return { wrapper, router };
}

const FORMS: PatientIntakeFormStatus[] = [
  { key: "informedConsent", done: false, category: "document", waiting_on_patient: true },
  { key: "medicalHistory", done: true, category: "document", waiting_on_patient: false },
  { key: "stopBang", done: false, category: "document", waiting_on_patient: true },
  { key: "oralExam", done: false, category: "document", waiting_on_patient: false },
  { key: "polysomnography", done: false, category: "study", waiting_on_patient: false },
];

describe("PatientNextStep (NEO-221)", () => {
  it("says how much waits on the patient, by abbreviation, with the count on the QR", async () => {
    const { wrapper } = await mountNextStep(FORMS);
    expect(wrapper.find(".next-step__title").text()).toBe("Waiting on the patient: 2");
    expect(wrapper.find(".next-step__items").text()).toBe("CI · SB");
    expect(wrapper.find(".next-step__badge").text()).toBe("2");
    expect(wrapper.find(".next-step__qr").attributes("disabled")).toBeUndefined();
  });

  it("shows all done and a disabled QR when nothing waits on the patient", async () => {
    const { wrapper } = await mountNextStep(FORMS.map((f) => ({ ...f, waiting_on_patient: false })));
    expect(wrapper.find(".next-step__title").text()).toBe("All done");
    expect(wrapper.find(".next-step__qr").attributes("disabled")).toBeDefined();
    expect(wrapper.find(".next-step__qr").classes()).toContain("next-step__qr--done");
  });

  it("phone card (compact) keeps only the QR", async () => {
    const { wrapper } = await mountNextStep(FORMS, true);
    expect(wrapper.find(".next-step__text").exists()).toBe(false);
    expect(wrapper.find(".next-step__qr").exists()).toBe(true);
  });

  it("the QR opens the patient with ?qr=1 and doesn't bubble to the row", async () => {
    const { wrapper, router } = await mountNextStep(FORMS);
    let bubbled = false;
    wrapper.element.parentElement?.addEventListener("click", () => (bubbled = true));
    await wrapper.find(".next-step__qr").trigger("click");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(router.currentRoute.value.name).toBe("patient-detail");
    expect(router.currentRoute.value.params.id).toBe("p-1");
    expect(router.currentRoute.value.query.qr).toBe("1");
    expect(bubbled).toBe(false);
  });
});
