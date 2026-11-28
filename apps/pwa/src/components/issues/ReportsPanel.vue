<template>
  <div class="issues-panel">
    <AppLoadingState v-if="loading" />
    <AppErrorState
      v-else-if="loadFailure"
      :error="loadFailure"
      :title="t('issues.errorLoad')"
      :refresh-label="t('app.errorState.refresh')"
      @refresh="load"
    />
    <template v-else>
      <IssueCounters v-model="filter" :counts="counts" :total="reports.length" />

      <div v-if="!visible.length" data-testid="reports-empty">
        <AppEmptyState
          v-if="!reports.length"
          :title="t('issues.reports.empty')"
          :subtitle="t('issues.reports.emptyHint', { time: checkedTime })"
        />
        <AppEmptyState
          v-else
          :title="t('issues.empty.filtered')"
          :subtitle="t('issues.empty.filteredHint', { total: reports.length, time: checkedTime })"
        />
      </div>

      <ul v-else class="issues-list" data-testid="reports-list">
        <li v-for="{ report, state } in visible" :key="report.id" class="issues-item" :data-testid="`report-item-${report.number}`">
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
          <div class="issues-item__side">
            <IssueStateChip :state="state" />
          </div>
        </li>
      </ul>
    </template>

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
import AppLoadingState from "../AppLoadingState.vue";
import AppErrorState from "../AppErrorState.vue";
import AppEmptyState from "../AppEmptyState.vue";
import AppIcon from "../AppIcon.vue";
import IssueCounters from "./IssueCounters.vue";
import IssueStateChip from "./IssueStateChip.vue";
import ReportDetailDialog from "./ReportDetailDialog.vue";
import { fetchReports, useIssuesPolling } from "../../composables/useIssues";
import { formatClockTime, formatRelativeTime } from "../../utils/relativeTime";
import { countIssues, matchesIssueFilter, reportState, statedReport, type IssueFilter } from "../../utils/issueState";
import type { ProblemReport } from "../../types/issues";

const props = defineProps<{
  /** The report whose detail is open (the view's ?report= query). */
  reportId: string | null;
}>();

const emit = defineEmits<{
  open: [id: string];
  close: [];
}>();

const { t, locale } = useI18n();

const filter = ref<IssueFilter>("active");
const reports = ref<ProblemReport[]>([]);
const loading = ref(true);
const loadFailure = ref<unknown>(null);
const checkedAt = ref(new Date());

const stated = computed(() => reports.value.map((report) => ({ report, issue: statedReport(report), state: reportState(report) })));
const counts = computed(() => countIssues(stated.value.map((row) => row.issue)));
const visible = computed(() => stated.value.filter((row) => matchesIssueFilter(row.issue, filter.value)));
const checkedTime = computed(() => formatClockTime(checkedAt.value, locale.value));

const selected = computed(() => (props.reportId ? (reports.value.find((r) => r.id === props.reportId) ?? null) : null));

async function load(): Promise<void> {
  loading.value = true;
  loadFailure.value = null;
  try {
    reports.value = await fetchReports("all");
    checkedAt.value = new Date();
  } catch (err) {
    loadFailure.value = err;
  } finally {
    loading.value = false;
  }
}

/** The once-a-minute refresh: no spinner, and a failed one keeps what is on screen. */
async function refresh(): Promise<void> {
  // An open report is being edited; replacing it under the dialog would drop the draft.
  if (loading.value || loadFailure.value || props.reportId) return;
  try {
    reports.value = await fetchReports("all");
    checkedAt.value = new Date();
  } catch {
    // benign: already reported by the request; the next tick tries again.
  }
}

onMounted(load);
useIssuesPolling(refresh);

// A link to a report that the current filter hides (e.g. from the Errors tab): widen to All once.
watch(
  [() => props.reportId, visible],
  ([id, rows]) => {
    if (id && selected.value && !rows.some((row) => row.report.id === id) && filter.value !== "all") filter.value = "all";
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
