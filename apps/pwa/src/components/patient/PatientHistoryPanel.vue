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
          <span v-if="entry.user_name"> — {{ entry.user_name }}</span>
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
import { apiFetch } from "../../composables/useApi";

const props = defineProps<{ patientId: string }>();

interface HistoryEntry {
  id: string;
  created_at: string;
  user_name: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
}

interface PatientHistory {
  entries: HistoryEntry[];
  lead_source: { source: string | null; converted_at: string | null } | null;
}

const { t } = useI18n();

const history = ref<PatientHistory | null>(null);
const loading = ref(false);
const loaded = ref(false);
const loadError = ref(false);

const entries = computed(() => history.value?.entries ?? []);

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
</style>
