<template>
  <VMenu v-model="menuOpen" :close-on-content-click="false" location="bottom start" class="app-filter-bar">
    <template #activator="{ props: menuProps }">
      <VTooltip location="bottom">
        <template #activator="{ props: tooltipProps }">
          <VBadge
            :content="activeFilterCount"
            color="primary"
            :model-value="activeFilterCount > 0"
            class="app-filter-bar__badge"
          >
            <VBtn
              v-bind="{ ...menuProps, ...tooltipProps }"
              icon
              variant="flat"
              size="large"
              :aria-label="t(titleKey)"
              class="app-filter-bar__btn app-filter-bar__btn--no-border"
            >
              <AppIcon name="filter" class="app-filter-bar__icon" />
            </VBtn>
          </VBadge>
        </template>
        <span>{{ t(titleKey) }}</span>
      </VTooltip>
    </template>
    <VCard min-width="260" class="app-filter-bar__card" elevation="2">
      <VCardTitle class="app-filter-bar__card-title">
        {{ t(titleKey) }}
      </VCardTitle>
      <VCardText class="app-filter-bar__card-body">
        <template v-for="def in definitions" :key="def.key">
          <VSelect
            v-if="def.type === 'select'"
            :model-value="getSelectValue(def)"
            :label="t(def.labelKey)"
            :items="getSelectOptions(def)"
            item-title="title"
            item-value="value"
            density="compact"
            variant="outlined"
            hide-details
            clearable
            :multiple="def.multiple !== false"
            :chips="hasChipOptions(def)"
            closable-chips
            :hide-selected="hasChipOptions(def)"
            class="app-filter-bar__field"
            @update:model-value="(v: string | string[]) => updateField(def.key, v)"
          >
            <template v-if="hasChipOptions(def)" #chip="{ item }">
              <span
                :class="['rep-lead-status-chip', 'app-filter-bar__chip', item.raw?.chipClass ?? '']"
                class="app-filter-bar__chip-wrap"
              >
                {{ item.raw?.title ?? item.title }}
                <button
                  type="button"
                  class="app-filter-bar__chip-close"
                  :aria-label="t('app.common.remove')"
                  @click.stop="removeChip(def, item.value)"
                >
                  <AppIcon name="close" class="app-filter-bar__chip-close-icon" />
                </button>
              </span>
            </template>
            <template v-if="hasChipOptions(def)" #item="{ item, props: itemProps }">
              <VListItem v-bind="{ ...itemProps, title: item.raw?.chipClass ? undefined : itemProps.title }">
                <template v-if="item.raw?.chipClass" #default>
                  <span :class="['rep-lead-status-chip', item.raw.chipClass]">
                    {{ item.raw?.title ?? item.title }}
                  </span>
                </template>
              </VListItem>
            </template>
          </VSelect>
          <VTextField
            v-else
            :model-value="modelValue[def.key] ?? ''"
            :label="t(def.labelKey)"
            density="compact"
            variant="outlined"
            hide-details
            clearable
            class="app-filter-bar__field"
            @update:model-value="(v: string) => updateField(def.key, v)"
          />
        </template>
      </VCardText>
    </VCard>
  </VMenu>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import AppIcon from "./AppIcon.vue";
import type { FilterDefinition } from "../composables/useFilters";
import type { ViewFilters } from "../utils/user-settings";

const props = defineProps<{
  modelValue: ViewFilters;
  definitions: FilterDefinition[];
  /** i18n key for the filters menu title (e.g. user.leads.filters.title). */
  titleKey: string;
  /** i18n key for the Clear button (e.g. user.leads.filters.clear). */
  clearKey: string;
  /** Number of filters currently active (for badge). */
  activeFilterCount: number;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: ViewFilters];
  clear: [];
}>();

const { t } = useI18n();
const menuOpen = ref(false);

function hasChipOptions(def: { options?: { chipClass?: string }[] }): boolean {
  return (def.options ?? []).some((o) => o.chipClass);
}

/** All filter options (excluding "All" / empty). Used for items so selection resolves correctly. */
function getSelectOptions(def: FilterDefinition): { title: string; value: string; chipClass?: string }[] {
  return (def.options ?? []).filter((o) => o.value !== "");
}

function getSelectValue(def: FilterDefinition): string | string[] {
  const v = props.modelValue[def.key];
  if (def.multiple === false) return (typeof v === "string" ? v : "") ?? "";
  return Array.isArray(v) ? v : (typeof v === "string" && v ? [v] : []);
}

function updateField(key: string, value: string | string[]) {
  const def = props.definitions.find((d) => d.key === key);
  const multi = def?.type === "select" && def?.multiple !== false;
  const normalized = multi
    ? (Array.isArray(value) ? value : value ? [value] : [])
    : (Array.isArray(value) ? value[0] ?? "" : String(value ?? ""));
  emit("update:modelValue", { ...props.modelValue, [key]: normalized });
}

function removeChip(def: FilterDefinition, value: string) {
  const current = getSelectValue(def);
  const arr = Array.isArray(current) ? current : current ? [current] : [];
  const next = arr.filter((v) => v !== value);
  updateField(def.key, next);
}

</script>

<style scoped>
.app-filter-bar__badge :deep(.v-badge__badge) {
  min-width: 18px;
  height: 18px;
  font-size: 0.7rem;
}

.app-filter-bar__btn {
  min-width: var(--rep-btn-min-width, 44px);
  min-height: var(--rep-btn-min-height, 44px);
  color: var(--rep-text, currentColor);
}

.app-filter-bar__btn--no-border {
  border: none;
  box-shadow: none;
  background: transparent;

  &:hover {
    background: rgba(var(--v-theme-on-surface), 0.08);
  }
}

.app-filter-bar__icon {
  width: 24px;
  height: 24px;
  display: block;
  color: inherit;
}

.app-filter-bar__card {
  border-radius: var(--rep-radius);
}

.app-filter-bar__card-title {
  font-size: 0.875rem;
  font-weight: 600;
  padding-bottom: 0;
}

.app-filter-bar__card-body {
  padding-top: 8px;
}

.app-filter-bar__field {
  margin-bottom: 12px;
}

.app-filter-bar__field:last-child {
  margin-bottom: 0;
}

/* Chips: custom chip with close button */
.app-filter-bar__chip-wrap {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.app-filter-bar__chip-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  margin: 0;
  margin-left: 2px;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: 50%;
  color: inherit;
  opacity: 0.85;

  &:hover {
    opacity: 1;
    background: rgba(0, 0, 0, 0.08);
  }
}

.app-filter-bar__chip-close-icon {
  width: 14px;
  height: 14px;
  display: block;
}
</style>
