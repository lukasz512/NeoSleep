import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { defineComponent, h, nextTick } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia } from "pinia";
import { PiniaColada, useQueryCache, type EntryKey } from "@pinia/colada";

const apiFetch = vi.fn();
vi.mock("./useApi", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

import { usePatientQuery, useUpdatePatient, patientKeys, optimisticPatient, useInvalidatePatient } from "./usePatientQueries";

type Patient = { id: string; name: string; first_name: string; last_name: string };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function setup() {
  const pinia = createPinia();
  const plugins = [pinia, PiniaColada] as const;
  const Card = defineComponent({
    setup() {
      const q = usePatientQuery<Patient>("p1");
      return () => h("div", { "data-testid": "name" }, q.data.value?.name ?? (q.isLoading.value ? "loading" : ""));
    },
  });
  return { pinia, plugins, Card, mountCard: () => mount(Card, { global: { plugins: [pinia, PiniaColada] } }) };
}

describe("usePatientQueries (CORE-181)", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-08T10:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("@CORE-181 AC3 a card opened again shows the cached patient at once and revalidates in the background", async () => {
    const { mountCard } = setup();
    apiFetch.mockResolvedValueOnce(json({ id: "p1", name: "Pablo Old", first_name: "Pablo", last_name: "Old" }));
    const first = mountCard();
    await flushPromises();
    expect(first.text()).toBe("Pablo Old");
    first.unmount();

    // Within 30 s: cached, no request at all.
    const quick = mountCard();
    expect(quick.text()).toBe("Pablo Old");
    await flushPromises();
    expect(apiFetch).toHaveBeenCalledTimes(1);
    quick.unmount();

    // Later: the cached record shows immediately (no spinner) while the refetch runs.
    vi.setSystemTime(new Date("2026-10-08T10:05:00Z"));
    let answer!: (r: Response) => void;
    apiFetch.mockReturnValueOnce(new Promise<Response>((r) => (answer = r)));
    const again = mountCard();
    await nextTick();
    expect(again.text()).toBe("Pablo Old");
    expect(apiFetch).toHaveBeenCalledTimes(2);
    answer(json({ id: "p1", name: "Pablo New", first_name: "Pablo", last_name: "New" }));
    await flushPromises();
    expect(again.text()).toBe("Pablo New");
  });

  it("@CORE-181 AC4 a failed save shows the edit at once, then rolls back and reports the error", async () => {
    const { pinia } = setup();
    let mutation!: ReturnType<typeof useUpdatePatient<Patient>>;
    let cache!: ReturnType<typeof useQueryCache>;
    const Host = defineComponent({
      setup() {
        mutation = useUpdatePatient<Patient>();
        cache = useQueryCache();
        return () => h("div");
      },
    });
    mount(Host, { global: { plugins: [pinia, PiniaColada] } });
    const key = [...patientKeys.detail("p1")];
    cache.setQueryData(key, { id: "p1", name: "Pablo Old", first_name: "Pablo", last_name: "Old" });

    let fail!: (r: Response) => void;
    apiFetch.mockReturnValueOnce(new Promise<Response>((r) => (fail = r)));
    apiFetch.mockResolvedValue(json({ id: "p1", name: "Pablo Old", first_name: "Pablo", last_name: "Old" }));
    const saving = mutation.mutateAsync({ id: "p1", data: { last_name: "New" } });
    await nextTick();
    expect(cache.getQueryData<Patient>(key)?.name).toBe("Pablo New");

    fail(json({ error: "boom" }, 500));
    await expect(saving).rejects.toMatchObject({ status: 500 });
    expect(cache.getQueryData<Patient>(key)?.name).toBe("Pablo Old");
    expect(mutation.error.value).toMatchObject({ status: 500 });
  });

  it("@CORE-181 AC1 a write about a patient invalidates every query under that patient, and only that patient", async () => {
    const { pinia } = setup();
    let invalidate!: ReturnType<typeof useInvalidatePatient>;
    let cache!: ReturnType<typeof useQueryCache>;
    mount(defineComponent({ setup() { invalidate = useInvalidatePatient(); cache = useQueryCache(); return () => h("div"); } }), { global: { plugins: [pinia, PiniaColada] } });
    cache.setQueryData([...patientKeys.appointments("p1")], []);
    cache.setQueryData([...patientKeys.summary("p1")], {});
    cache.setQueryData([...patientKeys.summary("p2")], {});
    await invalidate("p1");
    // An invalidated entry's timestamp is reset to 0, so its next use refetches.
    const when = (k: EntryKey) => cache.getEntries({ key: k, exact: true })[0]?.when;
    expect(when(patientKeys.appointments("p1"))).toBe(0);
    expect(when(patientKeys.summary("p1"))).toBe(0);
    expect(when(patientKeys.summary("p2"))).toBeGreaterThan(0);
  });

  it("a refetch that fails after an invalidation leaves the last data and throws nothing", async () => {
    const { mountCard } = setup();
    apiFetch.mockResolvedValueOnce(json({ id: "p1", name: "Pablo Old", first_name: "Pablo", last_name: "Old" }));
    let invalidate!: ReturnType<typeof useInvalidatePatient>;
    const card = mountCard();
    mount(defineComponent({ setup() { invalidate = useInvalidatePatient(); return () => h("div"); } }), { global: { plugins: [card.vm.$pinia] } });
    await flushPromises();
    apiFetch.mockResolvedValueOnce(json({ error: "down" }, 503));
    await expect(invalidate("p1")).resolves.toBeUndefined();
    await flushPromises();
    expect(card.text()).toBe("Pablo Old");
  });

  it("the optimistic record recomputes the display name only when a name part changed", () => {
    const prev = { id: "p1", name: "Dr. Pablo Old", first_name: "Pablo", last_name: "Old", phone: "1" };
    expect(optimisticPatient(prev, { phone: "2" }).name).toBe("Dr. Pablo Old");
    expect(optimisticPatient(prev, { last_name: "New" }).name).toBe("Pablo New");
  });
});
