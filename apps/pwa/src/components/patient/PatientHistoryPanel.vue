<template>
  <div class="patient-history-panel">
    <VAlert
      v-if="history?.lead_source"
      type="info"
      variant="tonal"
      density="comfortable"
      class="patient-history-panel__lead-source"
      :text="t('app.patients.detail.history.leadSource', { source: history.lead_source.source || t('app.patients.detail.history.unknownSource') })"
    />

    <AppLoadingState v-if="loading && !loaded" />
    <AppErrorState
      v-else-if="loadError"
      :title="t('app.errorState.title')"
      :subtitle="t('app.patients.detail.history.errorLoad')"
      :refresh-label="t('app.errorState.refresh')"
      :loading="loading"
      @refresh="loadHistory"
    />
    <AppStateView v-else-if="entries.length === 0" :title="t('app.patients.detail.history.empty')">
      <template #icon>
        <AppIcon name="file" />
      </template>
    </AppStateView>
    <ul v-else class="patient-history-panel__list">
      <li v-for="entry in entries" :key="entry.id" class="patient-history-panel__item">
        <span class="patient-history-panel__date">{{ new Date(entry.created_at).toLocaleString() }}</span>
        <span class="patient-history-panel__summary">
          {{ t(`app.patients.detail.history.action.${entry.action}`) }}
          <strong>{{ entry.entity_type }}</strong>
          <template v-if="entry.user_name">
            —
            <EntityLink :to="userDetailLink(authStore.user?.role, entry.user_id)" :label="entry.user_name" />
          </template>
          <span v-if="changedFieldsSummary(entry)" class="patient-history-panel__diff">
            {{ t("app.patients.detail.history.changedFields", { fields: changedFieldsSummary(entry) }) }}
          </span>
        </span>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import { useI18n } from "vue-i18n";
import { AppStateView } from "@ui";
import AppLoadingState from "../AppLoadingState.vue";
import AppErrorState from "../AppErrorState.vue";
import AppIcon from "../AppIcon.vue";
import EntityLink from "../EntityLink.vue";
import { apiFetch } from "../../composables/useApi";
import { useAuthStore } from "../../stores/auth";
import { userDetailLink } from "../../utils/entityLinks";

const props = defineProps<{ patientId: string }>();

interface HistoryEntry {
  id: string;
  created_at: string;
  user_id: string | null;
  user_name: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_before: Record<string, unknown> | null;
  entity_after: Record<string, unknown> | null;
}

interface PatientHistory {
  entries: HistoryEntry[];
  lead_source: { source: string | null; converted_at: string | null } | null;
}

const { t } = useI18n();
const authStore = useAuthStore();

const history = ref<PatientHistory | null>(null);
const loading = ref(false);
const loaded = ref(false);
const loadError = ref(false);

const entries = computed(() => history.value?.entries ?? []);

/**
 * Simple top-level key-list diff (not recursive) between entity_before/
 * entity_after — audit_log already stores both JSONB snapshots, but until
 * now nothing in the UI surfaced them (this panel showed only the action
 * verb + entity type). Returns null for create/delete entries (one side is
 * always null there) since "changed: ..." doesn't apply.
 */
function changedFieldsSummary(entry: HistoryEntry): string | null {
  const before = entry.entity_before;
  const after = entry.entity_after;
  if (!before || !after) return null;

  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changed = [...keys].filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
  return changed.length > 0 ? changed.join(", ") : null;
}

async function loadHistory() {
  loading.value = true;
  loadError.value = false;
  try {
    const res = await apiFetch(`/api/v1/patient/${props.patientId}/history`, { handleErrors: false });
    if (res.ok) {
      history.value = (await res.json()) as PatientHistory;
    } else {
      loadError.value = true;
    }
  } catch {
    loadError.value = true;
  } finally {
    loading.value = false;
    loaded.value = true;
  }
}

onMounted(loadHistory);
watch(() => props.patientId, loadHistory);
</script>

<style scoped>
.patient-history-panel__lead-source {
  margin-bottom: 16px;
}

.patient-history-panel__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.patient-history-panel__item {
  display: grid;
  grid-template-columns: 180px 1fr;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  font-size: 0.875rem;
}

.patient-history-panel__date {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.patient-history-panel__diff {
  display: block;
  margin-top: 2px;
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
</style>
