import { computed, toValue, type ComputedRef, type MaybeRefOrGetter, type Ref } from "vue";
import { useI18n } from "vue-i18n";
import type { BreadcrumbItem } from "../components/AppBreadcrumbs.types";
import type DetailViewTabs from "../components/DetailViewTabs.vue";

type DetailViewTab = InstanceType<typeof DetailViewTabs>["$props"]["tabs"][number];

/**
 * Builds a detail view's breadcrumb trail after the parent list (NEO-56):
 *
 *   <record — avatar, name, second identifier, exceptional status> › <active tab>
 *
 * The active tab is always the last crumb (the current page). While a tab
 * other than the first is open, the record crumb takes you back to the
 * record's first tab — an in-page action, because the views keep the tab in
 * a local ref (synced *to* the URL, not from it).
 */
export function useDetailBreadcrumbs(opts: {
  record: MaybeRefOrGetter<Omit<BreadcrumbItem, "to" | "action"> | null>;
  tabs?: MaybeRefOrGetter<DetailViewTab[]>;
  activeTab?: Ref<string>;
}): ComputedRef<BreadcrumbItem[]> {
  const { t } = useI18n();

  return computed(() => {
    const record = toValue(opts.record);
    if (!record) return [];

    const tabs = opts.tabs ? toValue(opts.tabs) : [];
    const activeTab = opts.activeTab;
    const current = activeTab ? tabs.find((tab) => tab.value === activeTab.value) : undefined;
    if (!activeTab || !current) return [{ ...record }];

    const first = tabs[0]!.value;
    const recordCrumb: BreadcrumbItem = { ...record };
    if (current.value !== first) {
      recordCrumb.action = () => {
        activeTab.value = first;
      };
    }
    return [recordCrumb, { label: t(current.labelKey) }];
  });
}
