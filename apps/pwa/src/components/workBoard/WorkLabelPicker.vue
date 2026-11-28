<template>
  <span class="work-label-picker" data-testid="work-item-labels">
    <WorkLabelChip v-for="label in modelValue" :key="label" :name="label" :color="colorOf(label)">
      <button
        type="button"
        class="work-label-picker__remove"
        :aria-label="t('workBoard.labels.remove', { name: label })"
        :data-testid="`work-item-label-remove-${label}`"
        @click="remove(label)"
      >
        <VIcon icon="mdi-close" size="14" aria-hidden="true" />
      </button>
    </WorkLabelChip>

    <VMenu v-model="menu" :close-on-content-click="false">
      <template #activator="{ props: activator }">
        <VChip
          v-bind="activator"
          prepend-icon="mdi-tag-plus-outline"
          variant="tonal"
          size="small"
          :disabled="full"
          :title="full ? t('workBoard.labels.limit', { max: MAX_ITEM_LABELS }) : undefined"
          data-testid="work-item-label-add"
        >
          {{ t("workBoard.labels.add") }}
        </VChip>
      </template>
      <VCard class="work-label-picker__menu" data-testid="work-item-label-menu">
        <VTextField
          v-model="typed"
          :placeholder="t('workBoard.labels.search')"
          :maxlength="MAX_LABEL_LENGTH"
          variant="outlined"
          density="compact"
          hide-details
          autofocus
          data-testid="work-item-label-input"
          @keydown.enter.prevent="addTyped"
        />
        <VList v-if="options.length || canCreate" density="compact">
          <VListItem v-for="option in options" :key="option.id" :data-testid="`work-item-label-option-${option.name}`" @click="add(option.name)">
            <WorkLabelChip :name="option.name" :color="option.color" />
          </VListItem>
          <VListItem
            v-if="canCreate"
            prepend-icon="mdi-plus"
            :title="t('workBoard.labels.create', { name: typedName })"
            data-testid="work-item-label-create"
            @click="addTyped"
          />
        </VList>
      </VCard>
    </VMenu>
  </span>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import WorkLabelChip from "./WorkLabelChip.vue";
import { MAX_ITEM_LABELS, MAX_LABEL_LENGTH, SESSION_LABEL } from "../../composables/useWorkBoard";
import type { WorkLabel, WorkLabelColor } from "../../types/workBoard";

/**
 * An item's labels in the dialog's chip row (CORE-219): each with a remove button, then a chip
 * that opens the catalog. Typing a name nobody has yet offers to create it; the API adds it to
 * the catalog when the item is saved.
 */
const props = defineProps<{ modelValue: string[]; labels: readonly WorkLabel[] }>();
const emit = defineEmits<{ "update:modelValue": [labels: string[]] }>();
const { t } = useI18n();

const menu = ref(false);
const typed = ref("");
const typedName = computed(() => typed.value.trim());
const full = computed(() => props.modelValue.length >= MAX_ITEM_LABELS);

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const has = (name: string) => props.modelValue.some((label) => same(label, name));

function colorOf(name: string): WorkLabelColor | undefined {
  return props.labels.find((label) => same(label.name, name))?.color;
}

const options = computed(() =>
  props.labels.filter((label) => !has(label.name) && label.name.toLowerCase().includes(typedName.value.toLowerCase())),
);
const canCreate = computed(
  () =>
    !!typedName.value &&
    !same(typedName.value, SESSION_LABEL) &&
    !has(typedName.value) &&
    !props.labels.some((label) => same(label.name, typedName.value)),
);

function add(name: string): void {
  if (full.value || has(name)) return;
  emit("update:modelValue", [...props.modelValue, name]);
  typed.value = "";
  if (props.modelValue.length + 1 >= MAX_ITEM_LABELS) menu.value = false;
}

/** Enter takes the catalog's spelling when the name exists, else the typed one as a new label. */
function addTyped(): void {
  const known = props.labels.find((label) => same(label.name, typedName.value));
  if (known) add(known.name);
  else if (canCreate.value) add(typedName.value);
}

function remove(name: string): void {
  emit("update:modelValue", props.modelValue.filter((label) => label !== name));
}
</script>

<style scoped>
/* The chips join the dialog's own chip row. */
.work-label-picker {
  display: contents;
}

.work-label-picker__remove {
  display: inline-flex;
  margin-right: -4px;
  padding: 2px;
  color: inherit;
  background: none;
  border: 0;
  border-radius: 50%;
  cursor: pointer;
}

.work-label-picker__remove:hover {
  background: rgba(var(--v-theme-on-surface), 0.12);
}

.work-label-picker__menu {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  min-width: 240px;
  max-width: 320px;
}
</style>
