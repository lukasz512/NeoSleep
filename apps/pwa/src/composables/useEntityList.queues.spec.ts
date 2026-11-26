// The doctor's Estudios / Tratamientos queue chips (decision D1, 2026-10-05): the list opens on
// "Needs you" when it has rows, else "In progress"; the chip goes to the API as ?queue=, and an
// empty chip is not an empty list.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { effectScope } from "vue";
import { setActivePinia, createPinia } from "pinia";
import { setPrefsIdentity } from "@prefs";

const requests: string[] = [];
let counts: Record<string, number> = {};
vi.mock("vue-router", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (k: string) => k }) }));
vi.mock("./useApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./useApi")>()),
  apiFetch: vi.fn(async (url: string) => {
    requests.push(url);
    const body = url.startsWith("/api/v1/treatment-plan/queues") ? counts : { items: [], total: 0 };
    return new Response(JSON.stringify(body), { status: 200 });
  }),
}));

import { useEntityList, clearListSnapshots, defaultQueue } from "./useEntityList";

const VALUES = ["action", "active", "follow_up", "done"] as const;

function mount() {
  const scope = effectScope();
  const list = scope.run(() =>
    useEntityList({
      viewId: "treatment-plans",
      apiEndpoint: "/api/v1/treatment-plan",
      filterDefinitions: [],
      i18n: { errorLoad: "x" },
      cacheable: false,
      queues: { endpoint: "/api/v1/treatment-plan/queues", values: VALUES },
    }),
  )!;
  return { list, stop: () => scope.stop() };
}

const listRequests = () => requests.filter((r) => r.startsWith("/api/v1/treatment-plan?"));
const queueOf = (url: string) => new URLSearchParams(url.split("?")[1]).get("queue");

describe("defaultQueue", () => {
  it("opens the first chip with rows, preferring the first two", () => {
    expect(defaultQueue(VALUES, { action: 2, active: 5 })).toBe("action");
    expect(defaultQueue(VALUES, { action: 0, active: 5 })).toBe("active");
    expect(defaultQueue(VALUES, { action: 0, active: 0, follow_up: 0, done: 3 })).toBe("done");
    expect(defaultQueue(VALUES, {})).toBe("action");
  });
});

describe("useEntityList › queue chips", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    requests.length = 0;
    clearListSnapshots();
    setActivePinia(createPinia());
    setPrefsIdentity({ tenant: "acme", userId: "u-1" });
  });
  afterEach(() => {
    setPrefsIdentity(null);
    vi.useRealTimers();
  });

  it("opens on 'Needs you' when it has rows and sends it as ?queue=", async () => {
    counts = { action: 2, active: 1, follow_up: 0, done: 0 };
    const { list, stop } = mount();
    await list.loadData();
    expect(list.queue.value).toBe("action");
    expect(queueOf(listRequests().at(-1)!)).toBe("action");
    stop();
  });

  it("falls back to 'In progress' when nothing needs the doctor", async () => {
    counts = { action: 0, active: 4, follow_up: 1, done: 9 };
    const { list, stop } = mount();
    await list.loadData();
    expect(list.queue.value).toBe("active");
    stop();
  });

  it("switching chips reloads that queue and is kept for the next visit to the list", async () => {
    counts = { action: 1, active: 1, follow_up: 1, done: 1 };
    const first = mount();
    await first.list.loadData();
    first.list.setQueue("done");
    await vi.runAllTimersAsync();
    expect(queueOf(listRequests().at(-1)!)).toBe("done");
    first.stop();

    const again = mount();
    expect(again.list.queue.value).toBe("done");
    again.stop();
  });

  it("an empty chip is not an empty list: the empty state needs every chip at zero", async () => {
    counts = { action: 0, active: 0, follow_up: 0, done: 3 };
    const { list, stop } = mount();
    list.setQueue("action");
    await vi.runAllTimersAsync();
    expect(list.total.value).toBe(0);
    expect(list.isTrulyEmpty.value).toBe(false);

    counts = { action: 0, active: 0, follow_up: 0, done: 0 };
    await list.loadData();
    await vi.runAllTimersAsync();
    expect(list.isTrulyEmpty.value).toBe(true);
    stop();
  });
});
