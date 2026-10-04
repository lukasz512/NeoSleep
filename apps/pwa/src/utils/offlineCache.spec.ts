import { describe, it, expect } from "vitest";
import { reactive, ref } from "vue";
import { toStorable } from "./offlineCache";

// IndexedDB's put() runs the structured clone algorithm, which rejects Vue's
// reactive proxies ("could not be cloned"). structuredClone uses the same
// algorithm, so it reproduces the pwa-dev crash on opening a doctor's card.
describe("toStorable", () => {
  const record = { id: "hcp-1", name: "Dr. Test", clinics: [{ id: "c-1", primary: true }] };

  it("reactive proxy is not cloneable as-is (the bug)", () => {
    expect(() => structuredClone(reactive({ ...record }))).toThrow();
  });

  it("turns a deep reactive record (ref.value) into a cloneable plain object", () => {
    const hcp = ref(structuredClone(record));
    const stored = toStorable(hcp.value as Record<string, unknown>);
    expect(() => structuredClone(stored)).not.toThrow();
    expect(stored).toEqual(record);
  });

  it("handles a nested proxy assigned inside a plain object", () => {
    const wrapper = { id: "hcp-2", org: reactive({ id: "o-1" }) };
    expect(() => structuredClone(toStorable(wrapper))).not.toThrow();
  });
});
