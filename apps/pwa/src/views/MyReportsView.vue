<template>
  <div class="view-my-reports issues-panel">
    <div class="view-my-reports__bar">
      <p class="view-my-reports__subtitle">{{ t("myReports.subtitle") }}</p>
      <AppButton variant="outlined" data-testid="my-reports-new" @click="openReportProblem({ where: 'my-reports' })">
        <template #prepend><AppIcon name="feedback" class="view-my-reports__icon" /></template>
        {{ t("myReports.newReport") }}
      </AppButton>
    </div>

    <AppLoadingState v-if="loading" />
    <AppErrorState
      v-else-if="loadFailure"
      :error="loadFailure"
      :title="t('myReports.errorLoad')"
      :refresh-label="t('app.errorState.refresh')"
      @refresh="load"
    />
    <AppEmptyState v-else-if="!reports.length" :title="t('myReports.empty')" :subtitle="t('myReports.emptyHint')" />

    <ul v-else class="issues-list" data-testid="my-reports-list">
      <li
        v-for="report in reports"
        :id="`report-${report.id}`"
        :key="report.id"
        class="view-my-reports__item"
        :class="{ 'view-my-reports__item--focused': report.id === focusedId }"
        :data-testid="`my-report-${report.number}`"
      >
        <div class="view-my-reports__head">
          <span class="view-my-reports__number">{{ t("myReports.number", { number: report.number }) }}</span>
          <span
            class="view-my-reports__status"
            :class="`view-my-reports__status--${report.status}`"
            data-testid="my-report-status"
          >{{ t(`myReports.status.${report.status}`) }}</span>
        </div>
        <p class="view-my-reports__description">{{ report.description }}</p>
        <div class="issues-row__meta">
          <span class="issues-row__chip">{{ t(`report.kind.${report.kind}`) }}</span>
          <span>{{ t("myReports.sentAt", { date: formatRelativeTime(report.created_at, locale) }) }}</span>
          <span v-if="report.tracker_ref" class="view-my-reports__ticket" data-testid="my-report-ticket">
            {{ t("myReports.ticket", { ticket: report.tracker_ref }) }}
          </span>
        </div>
        <div v-if="report.reporter_reply" class="view-my-reports__reply" data-testid="my-report-reply">
          <span class="issues-detail__label">{{ t("myReports.reply") }}</span>
          <p class="view-my-reports__reply-text">{{ report.reporter_reply }}</p>
        </div>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { useI18n } from "vue-i18n";
import AppButton from "../components/AppButton.vue";
import AppIcon from "../components/AppIcon.vue";
import AppLoadingState from "../components/AppLoadingState.vue";
import AppErrorState from "../components/AppErrorState.vue";
import AppEmptyState from "../components/AppEmptyState.vue";
import { fetchMyReports } from "../composables/useIssues";
import { openReportProblem, useReportProblem } from "../composables/useReportProblem";
import { formatRelativeTime } from "../utils/relativeTime";
import type { MyProblemReport } from "../types/issues";

/**
 * "My reports" (trackable feedback): every report the signed-in user sent, its status, the
 * ticket it was filed under and the team's reply. ?report=<id> (from the notification and
 * the email) scrolls to and marks that report. Refreshes after a new report is sent.
 */
const route = useRoute();
const { t, locale } = useI18n();
const { state: reportState } = useReportProblem();

const reports = ref<MyProblemReport[]>([]);
const loading = ref(true);
const loadFailure = ref<unknown>(null);

const focusedId = computed(() => {
  const value = route.query.report;
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === "string" && first ? first : null;
});

async function load(): Promise<void> {
  loading.value = true;
  loadFailure.value = null;
  try {
    reports.value = await fetchMyReports();
  } catch (err) {
    loadFailure.value = err;
  } finally {
    loading.value = false;
  }
  if (focusedId.value) {
    await nextTick();
    document.getElementById(`report-${focusedId.value}`)?.scrollIntoView({ block: "center" });
  }
}

onMounted(load);

// The dialog closes after a send (or a cancel): reload so a new report shows straight away.
watch(
  () => reportState.open,
  (open, wasOpen) => {
    if (wasOpen && !open) void load();
  },
);
</script>

<style scoped src="../components/issues/issues.css"></style>
<style scoped>
.view-my-reports {
  flex: 1 1 auto;
  min-height: 0;
}

.view-my-reports__bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.view-my-reports__subtitle {
  margin: 0;
  font-size: 0.875rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.view-my-reports__icon {
  width: 18px;
  height: 18px;
}

.view-my-reports__item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px 4px;
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.view-my-reports__item--focused {
  padding-inline: 12px;
  border-radius: 12px;
  background: rgba(var(--v-theme-primary), 0.06);
}

.view-my-reports__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.view-my-reports__number {
  font-size: 0.8125rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.view-my-reports__status {
  padding: 0 8px;
  border-radius: 999px;
  font-size: 0.75rem;
  line-height: 20px;
  --_tone: var(--v-theme-on-surface);
  color: rgb(var(--_tone));
  background: rgba(var(--_tone), 0.1);
}

.view-my-reports__status--in_progress { --_tone: var(--v-theme-info); }
.view-my-reports__status--resolved { --_tone: var(--v-theme-success); }

.view-my-reports__description {
  margin: 0;
  font-size: 0.9375rem;
  white-space: pre-line;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
  overflow: hidden;
}

.view-my-reports__ticket {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.view-my-reports__reply {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 12px;
  border-left: 2px solid rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-on-surface), 0.03);
}

.view-my-reports__reply-text {
  margin: 0;
  font-size: 0.875rem;
  white-space: pre-line;
}
</style>
