import { describe, it, expect } from "vitest";
import { defineComponent, ref, type Ref } from "vue";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import en from "@i18n/en.json";
import { useDetailBreadcrumbs } from "./useDetailBreadcrumbs";
import type { BreadcrumbItem } from "../components/AppBreadcrumbs.types";

const tabs = [
  { value: "details", labelKey: "app.patients.detail.tabs.details" },
  { value: "notes", labelKey: "app.patients.detail.tabs.notes" },
];

function run(record: Ref<Omit<BreadcrumbItem, "to" | "action"> | null>, activeTab?: Ref<string>) {
  let result!: ReturnType<typeof useDetailBreadcrumbs>;
  const Host = defineComponent({
    setup() {
      result = useDetailBreadcrumbs({ record, tabs, activeTab });
      return () => null;
    },
  });
  mount(Host, { global: { plugins: [createI18n({ legacy: false, locale: "en", messages: { en } })] } });
  return result;
}

describe("useDetailBreadcrumbs", () => {
  it("is empty until the record loads", () => {
    expect(run(ref(null), ref("details")).value).toEqual([]);
  });

  it("record, then the open tab as the last crumb", () => {
    const crumbs = run(ref({ label: "Jan Kowalski", secondary: "Mar 12, 1968" }), ref("notes")).value;
    expect(crumbs.map((c) => c.label)).toEqual(["Jan Kowalski", en["app.patients.detail.tabs.notes"]]);
    expect(crumbs[0]!.secondary).toBe("Mar 12, 1968");
  });

  it("on another tab, the record crumb switches back to the first tab", () => {
    const activeTab = ref("notes");
    const crumbs = run(ref({ label: "Jan Kowalski" }), activeTab);
    crumbs.value[0]!.action!();
    expect(activeTab.value).toBe("details");
  });

  it("on the first tab, the record crumb has no action (you're already there)", () => {
    expect(run(ref({ label: "Jan Kowalski" }), ref("details")).value[0]!.action).toBeUndefined();
  });

  it("without tab state, just the record", () => {
    expect(run(ref({ label: "Jan Kowalski" })).value.map((c) => c.label)).toEqual(["Jan Kowalski"]);
  });
});
