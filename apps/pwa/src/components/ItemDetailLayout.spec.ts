import { describe, it, expect, afterEach } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import { createRouter, createMemoryHistory } from "vue-router";
import { createI18n } from "vue-i18n";
import { defineComponent, h, type Ref } from "vue";
import { createPinia } from "pinia";
import en from "@i18n/en.json";
import ItemDetailLayout from "./ItemDetailLayout.vue";
import AppBreadcrumbs from "./AppBreadcrumbs.vue";
import { provideRecordHeaderClaim } from "../composables/usePageHeader";
import { forgetRecordPreview, recordPreviewFromItem, rememberRecordPreview } from "../composables/useRecordPreview";

// NEO-56 record header (Salesforce Lightning / Veeva pattern): module tile,
// parent eyebrow link, the record's name as the h1, actions inline. The back
// arrow itself is AppLayout's (NEO-55); while the record header is shown it
// claims AppLayout's desktop "← <Module>" row, so the eyebrow replaces it.
// Without a record, the NEO-55 row (title + teleported actions) comes back.

const mountedWrappers: VueWrapper[] = [];
afterEach(() => {
  for (const w of mountedWrappers.splice(0)) w.unmount();
});

const Stub = { render: () => null };
function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", component: Stub },
      { path: "/patients", name: "patients", component: Stub },
      { path: "/patients/:id", name: "patient-detail", component: Stub },
    ],
  });
}

type Props = InstanceType<typeof ItemDetailLayout>["$props"];

function mountLayout(props: Partial<Props>, slots?: Record<string, () => ReturnType<typeof h>>, router = makeRouter()) {
  const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });
  const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
  let claim!: Ref<boolean>;
  // Stand-in for AppLayout: owns the record-header claim.
  const Shell = defineComponent({
    setup() {
      claim = provideRecordHeaderClaim();
      return () =>
        h(
          ItemDetailLayout,
          {
            hasContent: true,
            loading: false,
            backRoute: { name: "patients" },
            backLabel: "Back to patients",
            notFoundLabel: "Not found",
            recordTitle: "Jan Kowalski",
            ...props,
          } as Props,
          { "header-actions": () => h("button", { class: "act" }, "Edit"), ...slots },
        );
    },
  });
  const wrapper = mount(Shell, { global: { plugins: [vuetify, i18n, router, createPinia()] } });
  mountedWrappers.push(wrapper);
  return { wrapper, claim: () => claim.value };
}

const header = (w: VueWrapper) => w.find("header.view-item__record-header");

describe("ItemDetailLayout — record header", () => {
  it("renders tile (module icon), parent eyebrow link, the name as the only h1, and the actions inline", () => {
    const { wrapper } = mountLayout({});
    expect(header(wrapper).exists()).toBe(true);
    expect(header(wrapper).find(".view-item__tile").exists()).toBe(true);
    const items = wrapper.findComponent(AppBreadcrumbs).props("items");
    expect(items).toEqual([{ label: en["user.patients.title"], to: { name: "patients" }, icon: "nav-patients" }]);

    const h1s = wrapper.findAll("h1");
    expect(h1s).toHaveLength(1);
    expect(h1s[0]!.text()).toBe("Jan Kowalski");
    expect(header(wrapper).find(".act").exists()).toBe(true);
  });

  it("claims AppLayout's page-header row while shown, and releases it on unmount", () => {
    const { wrapper, claim } = mountLayout({});
    expect(claim()).toBe(true);
    wrapper.unmount();
    mountedWrappers.splice(mountedWrappers.indexOf(wrapper), 1);
    expect(claim()).toBe(false);
  });

  it("puts title-extra (badges) next to the name", () => {
    const { wrapper } = mountLayout({}, { "title-extra": () => h("span", { class: "badge" }, "Invited") });
    expect(wrapper.find(".view-item__record-title-row .badge").text()).toBe("Invited");
  });

  it("while loading: the same header with a placeholder instead of the name, and no actions yet", () => {
    const { wrapper, claim } = mountLayout({ hasContent: false, loading: true, recordTitle: "" });
    expect(header(wrapper).exists()).toBe(true);
    expect(wrapper.find(".view-item__record-title-skeleton").exists()).toBe(true);
    expect(wrapper.find("h1").exists()).toBe(false);
    expect(wrapper.find(".act").exists()).toBe(false);
    expect(claim()).toBe(true);
  });

  it("not found / load error: no record header, AppLayout's row stays (claim released)", () => {
    for (const props of [{ hasContent: false }, { hasContent: false, loadError: true }]) {
      const { wrapper, claim } = mountLayout(props);
      expect(header(wrapper).exists()).toBe(false);
      expect(claim()).toBe(false);
    }
  });

  it("a view that passes no recordTitle keeps the NEO-55 row and doesn't claim the page header", () => {
    const { wrapper, claim } = mountLayout({ recordTitle: undefined });
    expect(header(wrapper).exists()).toBe(false);
    expect(wrapper.find(".view-item__header-row").exists()).toBe(true);
    expect(claim()).toBe(false);
  });

  it("a plain-path back route has no module to name: no record header", () => {
    const { wrapper, claim } = mountLayout({ backRoute: "/somewhere" });
    expect(header(wrapper).exists()).toBe(false);
    expect(claim()).toBe(false);
  });
});

// NEO-114: opened from a list, the header shows the tapped row's name +
// avatar at once, so the NEO-97 flight has somewhere to land while the
// record loads.
describe("ItemDetailLayout — header from the list row while loading", () => {
  afterEach(() => forgetRecordPreview());

  async function openAt(path: string) {
    const router = makeRouter();
    await router.push(path);
    return router;
  }
  const loadingProps = { hasContent: false, loading: true, recordTitle: "" };

  it("shows the row's name and avatar instead of the placeholder", async () => {
    const preview = recordPreviewFromItem("patients", { id: "7", name: "Sofía Ramírez", first_name: "Sofía", last_name: "Ramírez" })!;
    rememberRecordPreview("patient-detail", "7", preview);
    const { wrapper } = mountLayout(loadingProps, undefined, await openAt("/patients/7"));
    expect(wrapper.find("h1.view-item__record-title").text()).toBe("Sofía Ramírez");
    expect(header(wrapper).find(".app-avatar").text()).toContain("SR");
    expect(wrapper.find(".view-item__record-title-skeleton").exists()).toBe(false);
  });

  it("another record, or a direct visit, keeps the placeholder", async () => {
    rememberRecordPreview("patient-detail", "7", recordPreviewFromItem("patients", { id: "7", name: "Sofía Ramírez" })!);
    const { wrapper } = mountLayout(loadingProps, undefined, await openAt("/patients/8"));
    expect(wrapper.find(".view-item__record-title-skeleton").exists()).toBe(true);
    expect(wrapper.find("h1").exists()).toBe(false);
  });

  it("the loaded record replaces the preview", async () => {
    rememberRecordPreview("patient-detail", "7", recordPreviewFromItem("patients", { id: "7", name: "Sofía R." })!);
    const { wrapper } = mountLayout({ hasContent: true, loading: false, recordTitle: "Sofía Ramírez" }, undefined, await openAt("/patients/7"));
    expect(wrapper.find("h1.view-item__record-title").text()).toBe("Sofía Ramírez");
  });

  it("lists without an identity (e.g. territories) give no preview", () => {
    expect(recordPreviewFromItem("territories", { id: "1", name: "Norte" })).toBeNull();
  });
});
