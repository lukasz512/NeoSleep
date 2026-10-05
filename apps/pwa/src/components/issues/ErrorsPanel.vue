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
    <AppEmptyState v-else-if="!groups.length" :title="t('issues.errors.empty')" :subtitle="t('issues.errors.emptyHint')" />

    <ul v-else class="issues-list" data-testid="errors-list">
      <li v-for="group in groups" :key="group.id">
        <button type="button" class="issues-row" :data-testid="`error-row-${group.id}`" @click="selectedId = group.id">
          <span class="issues-row__dot" :class="{ 'issues-row__dot--warn': group.level === 'warn' }" :title="group.level" />
          <span class="issues-row__main">
            <span class="issues-row__title issues-row__title--mono">{{ group.message }}</span>
            <span class="issues-row__meta">
              <span class="issues-row__count">{{ t("issues.errors.count", { count: group.count }) }}</span>
              <span>{{ formatRelativeTime(group.last_seen, locale) }}</span>
              <span class="issues-row__chip">{{ sourceLabel(group.source) }}</span>
              <span v-if="group.tenant_slug">{{ group.tenant_slug }}</span>
            </span>
          </span>
        </button>
      </li>
    </ul>

    <AppFormDialog
      :model-value="selected !== null"
      :title="t('issues.detail.errorTitle')"
      max-width="720"
      @update:model-value="(v: boolean) => !v && (selectedId = null)"
      @close="selectedId = null"
    >
      <div v-if="shown" class="issues-detail" data-testid="error-detail">
        <p class="issues-detail__text issues-detail__mono">{{ shown.message }}</p>

        <dl class="issues-detail__facts">
          <dt>{{ t("issues.errors.count", { count: shown.count }) }}</dt>
          <dd>{{ t(`issues.status.${shown.status}`) }}</dd>
          <dt>{{ t("issues.errors.firstSeen") }}</dt>
          <dd>{{ formatRelativeTime(shown.first_seen, locale) }}</dd>
          <dt>{{ t("issues.errors.lastSeen") }}</dt>
          <dd>{{ formatRelativeTime(shown.last_seen, locale) }}</dd>
          <dt>{{ t("issues.errors.sourceLabel") }}</dt>
          <dd>{{ sourceLabel(shown.source) }}</dd>
          <template v-if="shown.tenant_slug">
            <dt>{{ t("issues.detail.tenant") }}</dt>
            <dd>{{ shown.tenant_slug }}</dd>
          </template>
          <template v-if="shown.request_id">
            <dt>{{ t("issues.errors.requestId") }}</dt>
            <dd class="issues-detail__mono">{{ shown.request_id }}</dd>
          </template>
        </dl>

        <div class="issues-detail__section">
          <span class="issues-detail__label">{{ t("issues.errors.stack") }}</span>
          <pre v-if="shown.stack" class="issues-detail__pre" data-testid="error-stack">{{ shown.stack }}</pre>
          <p v-else class="issues-detail__text">{{ t("issues.errors.noStack") }}</p>
        </div>

        <div v-if="metadataText" class="issues-detail__section">
          <span class="issues-detail__label">{{ t("issues.errors.metadata") }}</span>
          <pre class="issues-detail__pre">{{ metadataText }}</pre>
        </div>

        <div v-if="shown.linked_reports.length" class="issues-detail__section">
          <span class="issues-detail__label">{{ t("issues.errors.linkedReports") }}</span>
          <div class="issues-detail__links">
            <AppButton
              v-for="link in shown.linked_reports"
              :key="link.id"
              variant="tonal"
              size="small"
              :data-testid="`error-linked-report-${link.number}`"
              @click="emit('open-report', link.id)"
            >
              #{{ link.number }}
            </AppButton>
          </div>
        </div>
      </div>
      <template #actions>
        <VSpacer />
        <template v-if="shown">
          <template v-if="shown.status === 'open'">
            <AppButton variant="text" :loading="saving" data-testid="error-dismiss" @click="setStatus('dismissed')">
              {{ t("issues.errors.dismiss") }}
            </AppButton>
            <AppButton color="primary" variant="flat" :loading="saving" data-testid="error-resolve" @click="setStatus('resolved')">
              {{ t("issues.errors.resolve") }}
            </AppButton>
          </template>
          <AppButton v-else color="primary" variant="flat" :loading="saving" data-testid="error-reopen" @click="setStatus('open')">
            {{ t("issues.errors.reopen") }}
          </AppButton>
        </template>
      </template>
    </AppFormDialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { AppChipTabs } from "@ui";
import AppLoadingState from "../AppLoadingState.vue";
import AppErrorState from "../AppErrorState.vue";
import AppEmptyState from "../AppEmptyState.vue";
import AppFormDialog from "../AppFormDialog.vue";
import AppButton from "../AppButton.vue";
import { fetchDiagnostics, patchDiagnostic } from "../../composables/useIssues";
import { showErrorToast } from "../../composables/useErrorToast";
import { formatRelativeTime } from "../../utils/relativeTime";
import type { DiagnosticGroup, DiagnosticStatus } from "../../types/issues";

type ErrorFilter = DiagnosticStatus | "all";

const emit = defineEmits<{ "open-report": [id: string] }>();

const { t, locale } = useI18n();

const filter = ref<ErrorFilter>("open");
const groups = ref<DiagnosticGroup[]>([]);
const loading = ref(true);
const loadFailure = ref<unknown>(null);
const selectedId = ref<string | null>(null);
const saving = ref(false);
/** Last selected group — keeps the dialog content while it animates closed. */
const shown = ref<DiagnosticGroup | null>(null);

const filterOptions = computed(() =>
  (["open", "resolved", "dismissed", "all"] as const).map((value) => ({ value, label: t(`issues.errors.filter.${value}`) })),
);
const selected = computed(() => groups.value.find((g) => g.id === selectedId.value) ?? null);
watch(selected, (group) => {
  if (group) shown.value = group;
});
const metadataText = computed(() => {
  const meta = shown.value?.metadata;
  return meta && Object.keys(meta).length ? JSON.stringify(meta, null, 2) : "";
});

async function load(): Promise<void> {
  loading.value = true;
  loadFailure.value = null;
  try {
    groups.value = await fetchDiagnostics(filter.value);
  } catch (err) {
    loadFailure.value = err;
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch(filter, load);

function sourceLabel(source: string): string {
  return source === "api" || source === "frontend" ? t(`issues.errors.source.${source}`) : source;
}

async function setStatus(status: DiagnosticStatus): Promise<void> {
  const current = shown.value;
  if (!current || saving.value) return;
  saving.value = true;
  try {
    const updated = await patchDiagnostic(current.id, status);
    const merged: DiagnosticGroup = { ...current, ...updated, status };
    shown.value = merged;
    // The row leaves the list when it no longer matches the filter.
    groups.value =
      filter.value === "all"
        ? groups.value.map((g) => (g.id === merged.id ? merged : g))
        : groups.value.filter((g) => g.id !== merged.id);
    selectedId.value = null;
  } catch (err) {
    showErrorToast(err);
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped src="./issues.css"></style>
