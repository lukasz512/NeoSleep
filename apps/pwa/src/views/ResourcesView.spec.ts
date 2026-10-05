import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { ref, reactive, nextTick } from "vue";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import { createPinia } from "pinia";
import en from "@i18n/en.json";
import mx from "@i18n/mx.json";
import type { PartnerResourceItem } from "../composables/usePartnerResources";

/**
 * Resources page: the app's own PDFs count with the webinars, in the header
 * subtitle, the progress meter and the status chips.
 */
function video(n: number): PartnerResourceItem {
  return {
    id: String(n),
    partner: "orthoapnea",
    kind: "video",
    title: `Webinar ${n}`,
    description: "Dr. Example",
    mediaUrl: `https://api.test/media/${n}`,
    fileType: "video",
    languages: [{ code: "es", mediaUrl: `https://api.test/media/${n}` }],
    category: "Webinar",
    subcategory: null,
    weight: n,
    posterUrl: null,
    durationSec: 600,
    topic: n <= 6 ? "detect" : "diagnose",
  };
}

const videos = ref<PartnerResourceItem[]>([]);
const loadError = ref(false);
const progress = reactive<Record<string, unknown>>({});
const opened = reactive<Record<string, { completedAt: string | null }>>({});
const subtitle = ref<string | null>(null);

vi.mock("../composables/usePartnerResources", () => ({
  usePartnerResources: () => ({
    documents: ref([]),
    videos,
    documentGroups: ref([]),
    loading: ref(false),
    loadError,
    loadFailure: ref(null),
    load: vi.fn(),
  }),
}));
vi.mock("../composables/useResourceProgress", async (orig) => {
  const actual = await orig<typeof import("../composables/useResourceProgress")>();
  return { ...actual, useResourceProgress: () => ({ progress, load: vi.fn(), reportPosition: vi.fn(), markStatus: vi.fn() }) };
});
vi.mock("../composables/useFeaturedProgress", () => ({
  useFeaturedProgress: () => ({ opened, load: vi.fn(), markOpened: vi.fn(), markNotOpened: vi.fn() }),
}));
vi.mock("../composables/usePageHeader", () => ({
  usePageHeaderRow: () => ({ subtitle }),
  usePageHeaderTeleport: () => ({ to: "body", disabled: ref(true) }),
}));

const { default: ResourcesView } = await import("./ResourcesView.vue");

const mounted: VueWrapper[] = [];
beforeEach(() => {
  videos.value = Array.from({ length: 12 }, (_, i) => video(i + 1));
  loadError.value = false;
  subtitle.value = null;
  for (const k of Object.keys(progress)) delete progress[k];
  for (const k of Object.keys(opened)) delete opened[k];
  localStorage.clear();
});
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount();
  document.body.innerHTML = "";
});

async function mountView(locale = "mx") {
  const w = mount(ResourcesView, {
    global: {
      plugins: [
        createI18n({ legacy: false, locale, messages: { en, mx } }),
        createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives }),
        createPinia(),
      ],
      stubs: { Teleport: true },
    },
    attachTo: document.body,
  });
  mounted.push(w);
  await flushPromises();
  return w;
}

describe("ResourcesView with own documents", () => {
  it("counts webinars and documents in the header subtitle", async () => {
    await mountView("mx");
    expect(subtitle.value).toBe("12 webinars · 2 documentos");
    mounted.pop()!.unmount();
    await mountView("en");
    expect(subtitle.value).toBe("12 webinars · 2 documents");
  });

  it("puts the documents group first, under the meter, with its own opened counter", async () => {
    const w = await mountView();
    const groups = w.findAll(".view-resources__topic");
    expect(groups[0]!.attributes("data-testid")).toBe("resources-documents");
    expect(groups[0]!.get(".view-resources__topic-title").text()).toContain("Protocolo y guías");
    expect(w.get('[data-testid="resources-documents-count"]').text()).toBe("0 de 2 abiertos");
    expect(groups[0]!.findAll('[data-testid="resource-document-tile"]')).toHaveLength(2);
    const order = w.html().indexOf('data-testid="resources-progress"') < w.html().indexOf('data-testid="resources-documents"');
    expect(order).toBe(true);
  });

  it("meter and chips total webinars + PDFs (12 + 2 = 14), opened PDFs count as completed", async () => {
    const w = await mountView();
    expect(w.get('[data-testid="resources-progress"]').text()).toContain("0 de 14 completados");
    expect(w.get('[data-testid="resources-filter-all"]').text()).toContain("14");
    expect(w.get('[data-testid="resources-filter-not_started"]').text()).toContain("Pendientes");
    expect(w.get('[data-testid="resources-filter-not_started"]').text()).toContain("14");

    opened["guia-uso"] = { completedAt: "2026-10-03T09:00:00Z" };
    progress["1"] = { resourceId: "1", status: "completed", positionSec: 0, durationSec: 600, percent: 100, completedAt: null, updatedAt: "" };
    await nextTick();
    expect(w.get('[data-testid="resources-progress"]').text()).toContain("2 de 14 completados");
    expect(w.get('[data-testid="resources-filter-completed"]').text()).toContain("Completados");
    expect(w.get('[data-testid="resources-filter-completed"]').text()).toContain("2");
    expect(w.get('[data-testid="resources-documents-count"]').text()).toBe("1 de 2 abiertos");
  });

  it("the Completados chip keeps only the opened PDF, Pendientes only the unopened one", async () => {
    opened["guia-uso"] = { completedAt: "2026-10-03T09:00:00Z" };
    const w = await mountView();
    await w.get('[data-testid="resources-filter-completed"]').trigger("click");
    expect(w.findAll('[data-testid="resource-document-tile"]').map((t) => t.attributes("data-document-id"))).toEqual(["guia-uso"]);
    await w.get('[data-testid="resources-filter-not_started"]').trigger("click");
    expect(w.findAll('[data-testid="resource-document-tile"]').map((t) => t.attributes("data-document-id"))).toEqual(["protocolo-atencion"]);
    await w.get('[data-testid="resources-filter-in_progress"]').trigger("click");
    expect(w.find('[data-testid="resources-documents"]').exists()).toBe(false);
  });

  it("still shows the documents when the library is down or empty", async () => {
    loadError.value = true;
    const failed = await mountView();
    expect(failed.findAll('[data-testid="resource-document-tile"]')).toHaveLength(2);
    mounted.pop()!.unmount();
    loadError.value = false;
    videos.value = [];
    const empty = await mountView();
    expect(empty.findAll('[data-testid="resource-document-tile"]')).toHaveLength(2);
  });
});
