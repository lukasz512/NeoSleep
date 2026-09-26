<template>
  <AppFormDialog
    :model-value="modelValue"
    max-width="520"
    :title="t('app.clinical.upload.title')"
    @update:model-value="emit('update:modelValue', $event)"
    @close="emit('update:modelValue', false)"
  >
    <form id="study-upload-form" class="study-upload" novalidate @submit.prevent="onSubmit">
      <VFileInput
        id="study-upload-file"
        v-model="file"
        :label="t('app.clinical.upload.file')"
        accept="application/pdf,image/jpeg,image/png"
        prepend-icon=""
        variant="outlined"
        density="comfortable"
        show-size
        :error-messages="showErrors && !file ? t('app.clinical.upload.fileRequired') : ''"
      />
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
      <AppButton color="primary" type="submit" form="study-upload-form" :loading="saving">{{ t("app.clinical.save") }}</AppButton>
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
const file = ref<File | File[] | null>(null);
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
    notes.value = "";
    showErrors.value = false;
    attachTo.value = props.initialItem ?? NEW_STUDY;
    const item = props.items.find((i) => i.key === props.initialItem);
    title.value = item ? props.itemTitle(item) : "";
  },
  { immediate: true }
);

function onSubmit() {
  showErrors.value = true;
  const picked = Array.isArray(file.value) ? file.value[0] : file.value;
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
</style>
