<template>
  <div class="entity-history-panel">
    <VAlert
      v-if="history?.lead_source"
      type="info"
      variant="tonal"
      density="comfortable"
      class="entity-history-panel__lead-source"
      :text="t('app.patients.detail.history.leadSource', { source: history.lead_source.source || t('app.patients.detail.history.unknownSource') })"
    />

    <AppLoadingState v-if="loading && !loaded" />
    <AppErrorState
      v-else-if="loadError"
      :title="t('app.errorState.title')"
      :subtitle="t('app.history.errorLoad')"
      :refresh-label="t('app.errorState.refresh')"
      :loading="loading"
      @refresh="loadHistory"
    />
    <AppStateView v-else-if="entries.length === 0" :title="t('app.history.empty')">
      <template #icon>
        <AppIcon name="file" />
      </template>
    </AppStateView>
    <VTimeline
      v-else
      side="end"
      truncate-line="both"
      density="compact"
      line-thickness="2"
      class="entity-history-panel__timeline"
    >
      <VTimelineItem
        v-for="entry in entries"
        :key="entry.id"
        :dot-color="historyActionColor(entry.action)"
        size="small"
        fill-dot
      >
        <template #icon>
          <AppIcon :name="historyActionIcon(entry.action)" class="entity-history-panel__dot-icon" />
        </template>
        <div class="entity-history-panel__item">
          <span class="entity-history-panel__date">{{ new Date(entry.created_at).toLocaleString() }}</span>
          <span class="entity-history-panel__summary">
            {{ t(`app.history.action.${entry.action}`) }}
            <strong>{{ historyEntityTypeLabel(t, entry.entity_type) }}</strong>
            <template v-if="entry.user_name">
              —
              <EntityLink :to="userDetailLink(authStore.user?.role, entry.user_id)" :label="entry.user_name" />
            </template>
            <span v-if="changedFieldsSummary(entry)" class="entity-history-panel__diff">
              {{ t("app.history.changedFields", { fields: changedFieldsSummary(entry) }) }}
            </span>
          </span>
        </div>
      </VTimelineItem>
    </VTimeline>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import { useI18n } from "vue-i18n";
import { AppStateView } from "@ui";
import AppLoadingState from "./AppLoadingState.vue";
import AppErrorState from "./AppErrorState.vue";
import AppIcon from "./AppIcon.vue";
import EntityLink from "./EntityLink.vue";
import { apiFetch } from "../composables/useApi";
import { useAuthStore } from "../stores/auth";
import { userDetailLink } from "../utils/entityLinks";
import { historyActionIcon, historyActionColor, historyEntityTypeLabel } from "../utils/historyLabels";

/**
 * Generic history/audit-trail panel — entity-type-agnostic on purpose (props:
 * `endpoint`, not a patient id) so Patient/HCP/HCO detail views can all share
 * one timeline renderer instead of three near-identical copies. The
 * lead-conversion banner only ever renders for patients (the API only ever
 * returns `lead_source` on that endpoint) so it stays generic here too — no
 * per-entity-type branching needed on this side.
 */
const props = defineProps<{ endpoint: string }>();

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

interface EntityHistory {
  entries: HistoryEntry[];
  lead_source: { source: string | null; converted_at: string | null } | null;
}

const { t } = useI18n();
const authStore = useAuthStore();

const history = ref<EntityHistory | null>(null);
const loading = ref(false);
const loaded = ref(false);
const loadError = ref(false);

const entries = computed(() => history.value?.entries ?? []);

function formatValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}

/**
 * Top-level key diff between entity_before/entity_after, now showing each
 * changed field's old → new value (not just which fields changed) — a flat
 * name list left the reader to go dig up what actually happened. Returns
 * null for create/delete entries (one side is always null there) since
 * "changed: ..." doesn't apply.
 */
function changedFieldsSummary(entry: HistoryEntry): string | null {
  const before = entry.entity_before;
  const after = entry.entity_after;
  if (!before || !after) return null;

  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changed = [...keys].filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
  if (changed.length === 0) return null;
  return changed.map((k) => `${k}: ${formatValue(before[k])} → ${formatValue(after[k])}`).join(", ");
}

async function loadHistory() {
  loading.value = true;
  loadError.value = false;
  try {
    const res = await apiFetch(props.endpoint, { handleErrors: false });
    if (res.ok) {
      history.value = (await res.json()) as EntityHistory;
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
watch(() => props.endpoint, loadHistory);
</script>

<style scoped>
.entity-history-panel__lead-source {
  margin-bottom: 16px;
}

.entity-history-panel__timeline {
  padding-top: 4px;
}

/* Fixed white, not a theme token — the dot itself is always a saturated
   action color (success/info/error/warning/secondary) in both light and
   dark mode, so a light icon reads clearly against any of them. */
.entity-history-panel__dot-icon {
  color: #fff;
  width: 14px;
  height: 14px;
}

.entity-history-panel__item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-bottom: 12px;
  font-size: 0.875rem;
}

.entity-history-panel__date {
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.entity-history-panel__diff {
  display: block;
  margin-top: 2px;
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
</style>
