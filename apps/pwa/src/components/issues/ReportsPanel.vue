<template>
  <div class="issues-panel">
    <AppChipTabs v-model="filter" :options="filterOptions" class="issues-panel__filters" />

    <AppLoadingState v-if="loading" />
    <AppErrorState
      v-else-if="loadFailure"
      :error="loadFailure"
      :title="t('issues.errorLoad')"
      :refresh-label="t('app.errorState.refresh')"
      @refresh="load"
    />
    <AppEmptyState v-else-if="!reports.length" :title="t('issues.reports.empty')" :subtitle="t('issues.reports.emptyHint')" />

    <ul v-else class="issues-list" data-testid="reports-list">
      <li v-for="report in reports" :key="report.id">
        <button type="button" class="issues-row" :data-testid="`report-row-${report.number}`" @click="emit('open', report.id)">
          <span class="issues-row__number">#{{ report.number }}</span>
          <span class="issues-row__main">
            <span class="issues-row__title">{{ firstLine(report.description) }}</span>
            <span class="issues-row__meta">
              <span class="issues-row__chip">{{ t(`report.kind.${report.kind}`) }}</span>
              <span>{{ reporterLabel(report) }}</span>
              <span>{{ formatRelativeTime(report.created_at, locale) }}</span>
              <AppIcon v-if="report.has_attachment" name="paperclip" class="issues-row__clip" />
            </span>
          </span>
        </button>
      </li>
    </ul>

    <ReportDetailDialog
      :report="selected"
      @close="emit('close')"
      @saved="onSaved"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { AppChipTabs } from "@ui";
import AppLoadingState from "../AppLoadingState.vue";
import AppErrorState from "../AppErrorState.vue";
import AppEmptyState from "../AppEmptyState.vue";
import AppIcon from "../AppIcon.vue";
import ReportDetailDialog from "./ReportDetailDialog.vue";
import { fetchReports } from "../../composables/useIssues";
import { formatRelativeTime } from "../../utils/relativeTime";
import type { ProblemReport, ProblemStatus } from "../../types/issues";

type ReportFilter = ProblemStatus | "all";

const props = defineProps<{
  /** The report whose detail is open (the view's ?report= query). */
  reportId: string | null;
}>();

const emit = defineEmits<{
  open: [id: string];
  close: [];
}>();

const { t, locale } = useI18n();

const filter = ref<ReportFilter>("new");
const reports = ref<ProblemReport[]>([]);
const loading = ref(true);
const loadFailure = ref<unknown>(null);

const filterOptions = computed(() =>
  (["new", "in_progress", "resolved", "all"] as const).map((value) => ({ value, label: t(`issues.reports.filter.${value}`) })),
);

const selected = computed(() => (props.reportId ? (reports.value.find((r) => r.id === props.reportId) ?? null) : null));

async function load(): Promise<void> {
  loading.value = true;
  loadFailure.value = null;
  try {
    reports.value = await fetchReports(filter.value);
  } catch (err) {
    loadFailure.value = err;
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch(filter, load);

// A link to a report that the current filter hides (e.g. from the Errors tab): widen to All once.
watch(
  [() => props.reportId, reports],
  ([id, list]) => {
    if (id && !loading.value && !loadFailure.value && !list.some((r) => r.id === id) && filter.value !== "all") filter.value = "all";
  },
);

function onSaved(updated: ProblemReport): void {
  reports.value = reports.value.map((r) => (r.id === updated.id ? { ...r, ...updated } : r));
}

function firstLine(text: string): string {
  return text.split("\n", 1)[0] ?? "";
}

function reporterLabel(report: ProblemReport): string {
  const name = report.reporter_name || t("issues.reporterUnknown");
  return report.reporter_role ? `${name} · ${report.reporter_role}` : name;
}
</script>

<style scoped src="./issues.css"></style>
