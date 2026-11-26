// NEO-224: a row whose detail id lives in another field (e.g. patient_id on Estudios/Tratamientos)
// still opens the detail route — whose param is always `id` — instead of a silently rejected push.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { effectScope } from "vue";
import { setActivePinia, createPinia } from "pinia";

const push = vi.fn();
vi.mock("vue-router", () => ({ useRouter: () => ({ push }) }));
vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (k: string) => k }) }));
vi.mock("./useApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./useApi")>()),
  apiFetch: vi.fn(async () => new Response(JSON.stringify({ items: [], total: 0 }), { status: 200 })),
}));

import { useEntityList } from "./useEntityList";

function mount(opts: { detailRouteParam?: string; detailRouteQuery?: (item: Record<string, unknown>) => Record<string, string> }) {
  const scope = effectScope();
  const list = scope.run(() =>
    useEntityList({
      viewId: "sleep-studies",
      apiEndpoint: "/api/v1/sleep-study",
      filterDefinitions: [],
      filterParamKeys: [],
      i18n: { errorLoad: "x" },
      cacheable: false,
      detailRouteName: "patient-detail",
      ...opts,
    }),
  )!;
  return { list, stop: () => scope.stop() };
}

describe("useEntityList › row click (NEO-224)", () => {
  beforeEach(() => {
    push.mockClear();
    setActivePinia(createPinia());
  });

  it("takes the id from detailRouteParam but passes it as the route's `id` param", () => {
    const { list, stop } = mount({ detailRouteParam: "patient_id", detailRouteQuery: (item) => ({ tab: "studies", study: String(item.id) }) });
    list.onRowClick({ id: "ss-1", patient_id: "p-1" });
    expect(push).toHaveBeenCalledWith({ name: "patient-detail", params: { id: "p-1" }, query: { tab: "studies", study: "ss-1" } });
    stop();
  });

  it("defaults to the row's own id", () => {
    const { list, stop } = mount({});
    list.onRowClick({ id: "p-2" });
    expect(push).toHaveBeenCalledWith(expect.objectContaining({ params: { id: "p-2" } }));
    stop();
  });
});
