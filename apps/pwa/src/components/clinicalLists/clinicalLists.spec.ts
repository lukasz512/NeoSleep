import { describe, it, expect, afterEach } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import { createI18n } from "vue-i18n";
import { createPinia, setActivePinia } from "pinia";
import en from "@i18n/en.json";
import StudyResultCell from "./StudyResultCell.vue";
import NextVisitCell from "./NextVisitCell.vue";
import AhiTrend from "./AhiTrend.vue";
import TreatmentPlansView from "../../views/TreatmentPlansView.vue";
import SleepStudiesView from "../../views/SleepStudiesView.vue";
import { useAuthStore } from "../../stores/auth";

const mounted: VueWrapper[] = [];
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount();
});

function plugins() {
  const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });
  const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
  return [vuetify, i18n];
}

function mountWith<T>(component: T, props: Record<string, unknown>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper over several component types
  const w = mount(component as any, { props, global: { plugins: plugins() } });
  mounted.push(w);
  return w;
}

describe("StudyResultCell (D3: numbers shown, severity only after the pulmonologist)", () => {
  it("marks a not-yet-interpreted AHI as pending, with no severity", () => {
    const w = mountWith(StudyResultCell, { study: { status: "results_received", ahi_score: 34.1, spo2_nadir: 84, odi: 19 } });
    expect(w.text()).toContain("34.1");
    expect(w.find("[data-testid=study-result-pending]").text()).toBe(en["app.clinicalQueues.study.pendingPulmonologist"]);
    expect(w.find("[data-testid=study-result-severity]").exists()).toBe(false);
    expect(w.text()).toContain("SpO₂ 84 %");
  });

  it("shows the severity once interpreted", () => {
    const w = mountWith(StudyResultCell, { study: { status: "interpreted", ahi_score: 23.4, spo2_nadir: null, odi: null } });
    expect(w.find("[data-testid=study-result-severity]").text()).toBe(en["app.clinical.result.severity.moderate"]);
    expect(w.find("[data-testid=study-result-pending]").exists()).toBe(false);
  });

  it("is a dash without results", () => {
    const w = mountWith(StudyResultCell, { study: { status: "device_delivered", ahi_score: null, spo2_nadir: null, odi: null } });
    expect(w.text()).toBe("—");
  });
});

describe("NextVisitCell", () => {
  it("draws what waits on the doctor in the attention colour", () => {
    const overdue = mountWith(NextVisitCell, { line: { kind: "overdue", at: "2026-10-01T00:00:00Z" }, locale: "en-US" });
    expect(overdue.classes()).toContain("next-visit--attention");
    expect(overdue.text()).toContain("Overdue");
    const booked = mountWith(NextVisitCell, { line: { kind: "booked", at: "2026-10-09T10:30:00Z" }, locale: "en-US" });
    expect(booked.classes()).not.toContain("next-visit--attention");
  });
});

describe("AhiTrend", () => {
  it("shows first → latest with the drop in percent", () => {
    const w = mountWith(AhiTrend, { baseline: 31, latest: 6 });
    // Spacing between the parts is CSS gap, not text.
    expect(w.text().replace(/\s+/g, "")).toBe("31→6↓81%");
  });
});

/** The views pass their columns and chips to AppEntityList; stub it and read what they pass. */
const ListStub = { name: "AppEntityList", props: ["headers", "queues"], template: "<div />" };

function mountView(view: unknown, role: string) {
  setActivePinia(createPinia());
  const auth = useAuthStore();
  auth.$patch({ user: { id: "u-1", role } as never });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper over two views
  const w = mount(view as any, {
    global: { plugins: [...plugins()], stubs: { AppEntityList: ListStub, DeviceOrderReconciliationCard: true } },
  });
  mounted.push(w);
  const list = w.findComponent(ListStub);
  return {
    keys: (list.props("headers") as { key: string }[]).map((h) => h.key),
    queues: list.props("queues") as { options: { value: string }[] } | undefined,
  };
}

describe("doctor's list columns", () => {
  it("Tratamientos: a doctor gets the queue chips and no Doctor/Type columns; staff keep them", () => {
    const doctor = mountView(TreatmentPlansView, "doctor");
    expect(doctor.keys).toEqual(["patient_name", "stage", "next_visit", "device", "ahi"]);
    expect(doctor.queues?.options.map((o) => o.value)).toEqual(["action", "active", "follow_up", "done"]);

    const manager = mountView(TreatmentPlansView, "manager");
    expect(manager.keys).toContain("dentist_name");
    expect(manager.keys).toContain("type");
    expect(manager.queues).toBeUndefined();
  });

  it("Estudios: a doctor gets the chips and no 'Interpreted by' column", () => {
    const doctor = mountView(SleepStudiesView, "doctor");
    expect(doctor.keys).toEqual(["patient_name", "study", "result", "next_step"]);
    expect(doctor.queues?.options.map((o) => o.value)).toEqual(["action", "active", "done"]);
    expect(mountView(SleepStudiesView, "manager").keys).toContain("interpreted_by_name");
  });
});
