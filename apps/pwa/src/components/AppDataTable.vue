<template>
  <div class="app-data-table">
    <!-- Desktop: Vuetify data table -->
    <div v-show="!mobile" class="app-data-table__table-wrap">
      <VDataTable
        :headers="headers"
        :items="items"
        :item-value="itemValue"
        class="app-data-table__table"
        hover
      >
        <template #bottom></template>
      </VDataTable>
      <VAlert v-if="items.length === 0 && noResultsText" type="info" variant="tonal" density="comfortable" class="app-data-table__empty">
        {{ noResultsText }}
      </VAlert>
    </div>

    <!-- Mobile: feed of cards -->
    <div v-show="mobile" class="app-data-table__feed">
      <VCard
        v-for="item in items"
        :key="getItemKey(item)"
        variant="outlined"
        class="app-data-table__card"
      >
        <VCardTitle class="text-body-1 font-weight-medium">
          {{ getItemCell(item, titleKey) }}
        </VCardTitle>
        <VCardSubtitle v-if="metaKeys.length" class="text-caption text-medium-emphasis">
          {{ formatMeta(item) }}
        </VCardSubtitle>
      </VCard>
      <VAlert v-if="items.length === 0 && noResultsText" type="info" variant="tonal" density="comfortable" class="app-data-table__empty">
        {{ noResultsText }}
      </VAlert>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useDisplay } from "vuetify";

const { mobile } = useDisplay();

export interface AppDataTableHeader {
  title: string;
  key: string;
  sortable?: boolean;
}

const props = withDefaults(
  defineProps<{
    headers: AppDataTableHeader[];
    items: readonly object[];
    itemValue?: string;
    noResultsText?: string;
  }>(),
  { itemValue: "id", noResultsText: "" }
);

const titleKey = computed(() => (props.headers.length > 0 ? props.headers[0].key : ""));
const metaKeys = computed(() => props.headers.slice(1).map((h) => h.key));

function getItemKey(item: object): string | number {
  const r = item as Record<string, unknown>;
  const val = props.itemValue && r[props.itemValue];
  return val != null ? String(val) : Math.random();
}

function getItemCell(item: object, key: string): string {
  const v = (item as Record<string, unknown>)[key];
  return v != null ? String(v) : "";
}

function formatMeta(item: object): string {
  return metaKeys.value
    .map((k) => getItemCell(item, k))
    .filter(Boolean)
    .join(" · ");
}
</script>

<style scoped>
.app-data-table__table-wrap {
  overflow-x: auto;
  border-radius: var(--rep-radius);
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.app-data-table__table {
  min-width: 560px;
}

.app-data-table__feed {
  display: block;
}

.app-data-table__card {
  margin-bottom: 12px;
}

.app-data-table__card:last-of-type {
  margin-bottom: 0;
}

.app-data-table__empty {
  margin: 0;
}
</style>
