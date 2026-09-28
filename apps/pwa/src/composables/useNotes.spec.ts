import { describe, it, expect, vi, afterEach } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { setActivePinia, createPinia } from "pinia";
import { createI18n } from "vue-i18n";
import en from "@i18n/en.json";

const apiFetch = vi.fn();
vi.mock("./useApi", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));
vi.mock("./useNotifications", () => ({ useNotifications: () => ({ show: vi.fn() }) }));

import { useNotes } from "./useNotes";

type Notes = ReturnType<typeof useNotes>;

const mountedWrappers: VueWrapper[] = [];
afterEach(() => {
  for (const w of mountedWrappers.splice(0)) w.unmount();
  apiFetch.mockReset();
});

function mountNotes(entityType: string, entityId: string): Notes {
  let api: Notes | undefined;
  const Harness = defineComponent({
    setup() {
      api = useNotes(entityType, () => entityId);
      return () => h("div");
    },
  });
  setActivePinia(createPinia());
  const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
  mountedWrappers.push(mount(Harness, { global: { plugins: [i18n] } }));
  return api!;
}

const ok = (body: unknown) => ({ ok: true, json: async () => body }) as Response;
const listCalls = () => apiFetch.mock.calls.filter(([url]) => String(url).startsWith("/api/v1/note?"));

describe("useNotes — instances stay in sync (NEO-153)", () => {
  it("a note added in one instance reloads the other instance for the same record", async () => {
    apiFetch.mockImplementation(async () => ok({ items: [] }));
    const panel = mountNotes("patient", "p-1");
    mountNotes("patient", "p-1");
    await panel.addNote("Quick note");
    await flushPromises();
    // Adding instance reloads itself, the second one reloads on the event.
    expect(listCalls()).toHaveLength(2);
  });

  it("ignores changes to another record", async () => {
    apiFetch.mockImplementation(async () => ok({ items: [] }));
    const panel = mountNotes("patient", "p-1");
    mountNotes("patient", "p-2");
    await panel.addNote("Quick note");
    await flushPromises();
    expect(listCalls()).toHaveLength(1);
  });

  it("stops listening once its component unmounts", async () => {
    apiFetch.mockImplementation(async () => ok({ items: [] }));
    const panel = mountNotes("patient", "p-1");
    mountNotes("patient", "p-1");
    mountedWrappers.pop()!.unmount();
    await panel.addNote("Quick note");
    await flushPromises();
    expect(listCalls()).toHaveLength(1);
  });
});
