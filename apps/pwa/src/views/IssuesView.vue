<template>
  <div class="view-issues">
    <AppLoadingState v-if="loading" />
    <DetailViewTabs v-else v-model="activeTab" :tabs="tabs">
      <template #reports>
        <ReportsPanel :report-id="reportId" @open="openReport" @close="closeReport" />
      </template>
      <template #errors>
        <ErrorsPanel @open-report="openReport" />
      </template>
    </DetailViewTabs>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppLoadingState from "../components/AppLoadingState.vue";
import DetailViewTabs, { type DetailViewTab } from "../components/DetailViewTabs.vue";
import ReportsPanel from "../components/issues/ReportsPanel.vue";
import ErrorsPanel from "../components/issues/ErrorsPanel.vue";
import { fetchPlatformAdmin } from "../composables/useIssues";

/**
 * Admin Issues: user-reported problems (every admin, their own tenant) and, for platform
 * admins only, the grouped production errors. ?tab=errors and ?report=<id> deep-link into it
 * (the report email and the Errors tab's linked reports use them).
 */
const route = useRoute();
const router = useRouter();

const loading = ref(true);
const platformAdmin = ref(false);

const tabs = computed<DetailViewTab[]>(() => [
  { value: "reports", labelKey: "issues.tabs.reports" },
  ...(platformAdmin.value ? [{ value: "errors", labelKey: "issues.tabs.errors" }] : []),
]);

function queryString(key: string): string | null {
  const value = route.query[key];
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === "string" && first ? first : null;
}

const activeTab = computed<string>({
  get: () => (queryString("tab") === "errors" && platformAdmin.value ? "errors" : "reports"),
  set: (value) => {
    void router.replace({ query: { ...route.query, report: undefined, tab: value === "errors" ? "errors" : undefined } });
  },
});
const reportId = computed(() => queryString("report"));

function openReport(id: string): void {
  void router.replace({ query: { ...route.query, tab: undefined, report: id } });
}

function closeReport(): void {
  void router.replace({ query: { ...route.query, report: undefined } });
}

onMounted(async () => {
  platformAdmin.value = await fetchPlatformAdmin();
  loading.value = false;
});
</script>

<style scoped>
.view-issues {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

</style>
