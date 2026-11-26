<template>
  <AppFormDialog
    :model-value="modelValue"
    max-width="520"
    :title="t('app.clinical.upload.title')"
    @update:model-value="emit('update:modelValue', $event)"
    @close="emit('update:modelValue', false)"
  >
    <form id="study-upload-form" class="study-upload" novalidate @submit.prevent="onSubmit">
      <div class="study-upload__file" :class="{ 'study-upload__file--error': showErrors && !pickedFile }">
        <input
          id="study-upload-file"
          ref="fileInput"
          type="file"
          class="study-upload__file-input"
          accept="application/pdf,image/jpeg,image/png"
          data-testid="study-upload-file"
          @change="onFileChosen"
        >
        <span class="study-upload__file-label">{{ t("app.clinical.upload.file") }}</span>
        <div class="study-upload__file-row">
          <AppButton variant="tonal" color="primary" data-testid="study-upload-pick" @click="fileInput?.click()">
            {{ pickedFile ? t("app.clinical.upload.changeFile") : t("app.clinical.upload.chooseFile") }}
          </AppButton>
          <span v-if="pickedFile" class="study-upload__file-name">{{ pickedFile.name }} · {{ formatSize(pickedFile.size) }}</span>
        </div>
        <span v-if="showErrors && !pickedFile" class="study-upload__file-error">{{ t("app.clinical.upload.fileRequired") }}</span>
      </div>
      <VTextField
        id="study-upload-title"
        v-model="title"
        :label="t('app.clinical.upload.titleField')"
        variant="outlined"
        density="comfortable"
        maxlength="200"
        :error-messages="showErrors && !title.trim() ? t('app.clinical.upload.titleRequired') : ''"
      />
      <VTextarea
        id="study-upload-notes"
        v-model="notes"
        :label="t('app.clinical.upload.notes')"
        variant="outlined"
        density="comfortable"
        rows="3"
        auto-grow
        maxlength="2000"
      />
      <VSelect
        id="study-upload-attach"
        v-model="attachTo"
        :items="attachOptions"
        item-title="title"
        item-value="value"
        :label="t('app.clinical.upload.attachTo')"
        :hint="t('app.clinical.upload.attachHint')"
        persistent-hint
        variant="outlined"
        density="comfortable"
      />
    </form>

    <template #actions>
      <VSpacer />
      <AppButton variant="text" @click="emit('update:modelValue', false)">{{ t("app.common.cancel") }}</AppButton>
      <AppButton color="primary" variant="flat" type="submit" form="study-upload-form" :loading="saving">{{ t("app.clinical.save") }}</AppButton>
    </template>
  </AppFormDialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import AppFormDialog from "../AppFormDialog.vue";
import AppButton from "../AppButton.vue";
import type { ChecklistItem } from "../../composables/usePatientChecklist";

/**
 * "Agregar estudio" — a file from the doctor's computer (PDF / JPG / PNG)
 * with a title and notes. Attached to a checklist item it completes that
 * item (a lab PSG report, a consent signed on paper); otherwise it becomes
 * its own study in "Otros estudios".
 */
const props = defineProps<{
  modelValue: boolean;
  items: ChecklistItem[];
  itemTitle: (item: ChecklistItem) => string;
  /** Preselected item when opened from a row's "Subir archivo". */
  initialItem?: string | null;
  saving?: boolean;
}>();
const emit = defineEmits<{ "update:modelValue": [open: boolean]; submit: [form: FormData] }>();
const { t } = useI18n();

const NEW_STUDY = "";
const file = ref<File | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const pickedFile = computed(() => file.value);
const title = ref("");
const notes = ref("");
const attachTo = ref<string>(NEW_STUDY);
const showErrors = ref(false);

const attachOptions = computed(() => [
  { value: NEW_STUDY, title: t("app.clinical.upload.newStudy") },
  ...props.items.filter((item) => item.actions.upload).map((item) => ({ value: item.key, title: props.itemTitle(item) })),
]);

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    file.value = null;
    if (fileInput.value) fileInput.value.value = "";
    notes.value = "";
    showErrors.value = false;
    attachTo.value = props.initialItem ?? NEW_STUDY;
    const item = props.items.find((i) => i.key === props.initialItem);
    title.value = item ? props.itemTitle(item) : "";
  },
  { immediate: true }
);

function onFileChosen(event: Event) {
  file.value = (event.target as HTMLInputElement).files?.[0] ?? null;
}

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function onSubmit() {
  showErrors.value = true;
  const picked = file.value;
  if (!picked || !title.value.trim()) return;
  const form = new FormData();
  form.append("file", picked);
  form.append("title", title.value.trim());
  form.append("notes", notes.value.trim());
  form.append("checklistItem", attachTo.value);
  emit("submit", form);
}
</script>

<style scoped>
.study-upload {
  display: grid;
  gap: 8px;
}
.study-upload__file {
  display: grid;
  gap: 8px;
  padding-bottom: 8px;
}
.study-upload__file-input {
  display: none;
}
.study-upload__file-label {
  font-size: 12px;
  color: rgba(var(--v-theme-on-surface), 0.6);
}
.study-upload__file-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.study-upload__file-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
}
.study-upload__file-error {
  font-size: 12px;
  color: rgb(var(--v-theme-error));
}
</style>
