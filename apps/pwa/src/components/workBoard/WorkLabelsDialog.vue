<template>
  <AppFormDialog
    :model-value="open"
    :title="t('workBoard.labels.title')"
    max-width="520"
    @update:model-value="(v: boolean) => !v && emit('close')"
    @close="emit('close')"
  >
    <div class="work-labels" data-testid="work-labels-dialog">
      <p class="work-labels__hint">{{ t("workBoard.labels.hint") }}</p>
      <p v-if="!rows.length" class="work-labels__hint">{{ t("workBoard.labels.empty") }}</p>
      <ul v-else class="work-labels__list">
        <li v-for="row in rows" :key="row.id" class="work-labels__row" :data-testid="`work-label-row-${row.id}`">
          <VMenu>
            <template #activator="{ props: activator }">
              <button
                v-bind="activator"
                type="button"
                class="work-labels__swatch"
                :aria-label="t('workBoard.labels.color', { name: row.saved })"
                :data-testid="`work-label-color-${row.id}`"
              >
                <WorkLabelChip :name="t(`workBoard.color.${row.color}`)" :color="row.color" small />
              </button>
            </template>
            <VList density="compact" :data-testid="`work-label-colors-${row.id}`">
              <VListItem
                v-for="color in WORK_LABEL_COLORS"
                :key="color"
                :active="color === row.color"
                :data-testid="`work-label-color-${row.id}-${color}`"
                @click="recolor(row, color)"
              >
                <WorkLabelChip :name="t(`workBoard.color.${color}`)" :color="color" small />
              </VListItem>
            </VList>
          </VMenu>
          <VTextField
            v-model="row.name"
            :aria-label="t('workBoard.labels.name')"
            :maxlength="MAX_LABEL_LENGTH"
            :error-messages="row.error ? [row.error] : []"
            variant="outlined"
            density="compact"
            hide-details="auto"
            :data-testid="`work-label-name-${row.id}`"
            @update:model-value="row.error = ''"
            @keydown.enter.prevent="rename(row)"
          />
          <AppButton
            variant="tonal"
            size="small"
            :loading="row.saving"
            :disabled="!renamed(row)"
            :data-testid="`work-label-save-${row.id}`"
            @click="rename(row)"
          >
            {{ t("workBoard.labels.save") }}
          </AppButton>
        </li>
      </ul>
    </div>
  </AppFormDialog>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { isApiError } from "@api";
import AppFormDialog from "../AppFormDialog.vue";
import AppButton from "../AppButton.vue";
import WorkLabelChip from "./WorkLabelChip.vue";
import { MAX_LABEL_LENGTH, WORK_LABEL_COLORS, patchWorkLabel } from "../../composables/useWorkBoard";
import type { WorkLabel, WorkLabelColor } from "../../types/workBoard";

/**
 * The label catalog (CORE-219, decision D2): rename a label or give it another colour. A rename
 * reaches every item that carries the label, in one step on the API. Labels are added from an
 * item, and deleting one is not offered.
 */
const props = defineProps<{ open: boolean; labels: readonly WorkLabel[] }>();
const emit = defineEmits<{ close: []; saved: [label: WorkLabel, previousName: string] }>();
const { t } = useI18n();

interface Row {
  id: string;
  /** The name as the catalog has it. */
  saved: string;
  name: string;
  color: WorkLabelColor;
  saving: boolean;
  error: string;
}
const rows = ref<Row[]>([]);

// A name being typed survives the catalog refresh that follows another row's save.
watch(
  () => [props.open, props.labels] as const,
  ([open, labels]) => {
    if (!open) return;
    const typing = new Map(rows.value.filter(renamed).map((row) => [row.id, row.name]));
    rows.value = labels.map((label) => ({
      id: label.id,
      saved: label.name,
      name: typing.get(label.id) ?? label.name,
      color: label.color,
      saving: false,
      error: "",
    }));
  },
  { immediate: true },
);

function renamed(row: Row): boolean {
  return !!row.name.trim() && row.name.trim() !== row.saved;
}

async function save(row: Row, patch: { name?: string; color?: WorkLabelColor }): Promise<void> {
  row.saving = true;
  row.error = "";
  const previous = row.saved;
  try {
    const label = await patchWorkLabel(row.id, patch);
    row.saved = label.name;
    row.color = label.color;
    if (patch.name !== undefined) row.name = label.name;
    emit("saved", label, previous);
  } catch (err) {
    // The API answers 400 for a name that is taken, reserved or too long; anything else was already reported.
    if (isApiError(err) && err.status === 400) row.error = t("workBoard.labels.invalid");
  } finally {
    row.saving = false;
  }
}

function rename(row: Row): void {
  if (renamed(row) && !row.saving) void save(row, { name: row.name.trim() });
}

function recolor(row: Row, color: WorkLabelColor): void {
  if (color !== row.color && !row.saving) void save(row, { color });
}
</script>

<style scoped>
.work-labels {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.work-labels__hint {
  margin: 0;
  font-size: 0.875rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.work-labels__list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.work-labels__row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.work-labels__row > :deep(.v-input) {
  flex: 1 1 auto;
  min-width: 0;
}

/* The swatch and the button sit on the field's 40px row, also when an error grows the field. */
.work-labels__swatch,
.work-labels__row > :deep(.v-btn) {
  flex: none;
  height: 40px;
}

.work-labels__swatch {
  display: inline-flex;
  align-items: center;
  /* One column for every colour name, so the name fields line up. */
  min-width: 96px;
  padding: 0;
  background: none;
  border: 0;
  border-radius: 999px;
  cursor: pointer;
}

.work-labels__swatch:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
}
</style>
