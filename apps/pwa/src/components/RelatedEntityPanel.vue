<template>
  <div class="related-entity-panel">
    <AppLoadingState v-if="loading && !loaded" />
    <AppErrorState
      v-else-if="loadError"
      :title="t('app.errorState.title')"
      :subtitle="t('app.errorState.subtitle')"
      :refresh-label="t('app.errorState.refresh')"
      :loading="loading"
      @refresh="load"
    />
    <AppEmptyState v-else-if="items.length === 0" :title="emptyLabel" />
    <ul v-else class="related-entity-panel__list">
      <li v-for="item in items" :key="item.id" class="related-entity-panel__item">
        <EntityLink :to="{ name: detailRouteName, params: { id: item.id } }" :label="item.name" />
        <span v-if="item.meta" class="related-entity-panel__meta">{{ item.meta }}</span>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from "vue";
import { useI18n } from "vue-i18n";
import AppLoadingState from "./AppLoadingState.vue";
import AppErrorState from "./AppErrorState.vue";
import AppEmptyState from "./AppEmptyState.vue";
import EntityLink from "./EntityLink.vue";
import { apiFetch } from "../composables/useApi";

/**
 * Generic "list of entities related to this one" tab body — e.g. an HCP's
 * patients, an HCO's practitioners. Not paginated/filterable like the full
 * list views (AppEntityList) — a detail tab realistically shows a handful of
 * rows, not thousands, so a plain fetched list keeps this small.
 */
const props = defineProps<{
  endpoint: string;
  detailRouteName: string;
  emptyLabel: string;
}>();

interface RelatedItem {
  id: string;
  name: string;
  meta?: string | null;
}

const { t } = useI18n();
const items = ref<RelatedItem[]>([]);
const loading = ref(false);
const loaded = ref(false);
const loadError = ref(false);

async function load() {
  loading.value = true;
  loadError.value = false;
  try {
    const res = await apiFetch(props.endpoint, { handleErrors: false });
    if (res.ok) {
      const json = (await res.json()) as { items?: RelatedItem[] };
      items.value = json.items ?? [];
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

onMounted(load);
watch(() => props.endpoint, load);
</script>

<style scoped>
.related-entity-panel__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.related-entity-panel__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
  /* --pwa-table-border (theme.scss): shared with AppEntityList's table-wrap
     and AppDataTable's border, was Vuetify's generic --v-border-color here
     — a different gray from the rest of the app's tables. */
  border-bottom: 1px solid var(--pwa-table-border);
  font-size: 0.9375rem;
}

.related-entity-panel__meta {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.8125rem;
}
</style>
