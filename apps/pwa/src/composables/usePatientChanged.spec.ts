import { describe, it, expect, vi } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { emitPatientChanged, onPatientChanged, type PatientChangeScope } from "./usePatientChanged";

function mountListener(patientId: string, handler: (scope: PatientChangeScope) => void) {
  return mount(defineComponent({ setup() { onPatientChanged(() => patientId, handler); return () => h("div"); } }));
}

describe("usePatientChanged", () => {
  it("calls the handler with the scope for this patient only", () => {
    const handler = vi.fn();
    const w = mountListener("p-1", handler);
    emitPatientChanged("p-2", "visits");
    emitPatientChanged("p-1", "visits");
    expect(handler.mock.calls).toEqual([["visits"]]);
    w.unmount();
  });

  it("stops listening once unmounted", () => {
    const handler = vi.fn();
    mountListener("p-1", handler).unmount();
    emitPatientChanged("p-1", "profile");
    expect(handler).not.toHaveBeenCalled();
  });
});
