<template>
  <VDialog
    :model-value="modelValue"
    max-width="680"
    content-class="event-form-dialog__content"
    class="event-form-dialog"
    @update:model-value="onDialogUpdate"
  >
    <VCard class="event-form-dialog__card">
      <VCardTitle class="mx-2 mt-2 text-h6">
        {{ formTitle }}
      </VCardTitle>
      <VCardText>
        <VForm ref="formRef" @submit.prevent="onSubmit">
          <VTextField
            v-model="form.title"
            :label="t('rep.planner.form.fieldTitle')"
            variant="outlined"
            density="comfortable"
            class="mb-3"
            autocomplete="off"
          />
          <div class="event-form__row mb-3">
            <VTextField
              v-model="form.start"
              :label="t('rep.planner.form.fieldStart')"
              type="datetime-local"
              variant="outlined"
              density="comfortable"
              class="event-form__row-item"
              :rules="startRules"
            />
            <VTextField
              v-model="form.end"
              :label="t('rep.planner.form.fieldEnd')"
              type="datetime-local"
              variant="outlined"
              density="comfortable"
              class="event-form__row-item"
              :rules="endRules"
            />
          </div>
          <div class="event-form__row mb-3">
            <VSelect
              v-model="form.type"
              :label="t('rep.planner.form.fieldType')"
              :items="typeItems"
              item-title="title"
              item-value="value"
              variant="outlined"
              density="comfortable"
              class="event-form__row-item"
            />
            <VSelect
              v-model="form.status"
              :label="t('rep.planner.form.fieldStatus')"
              :items="statusItems"
              item-title="title"
              item-value="value"
              variant="outlined"
              density="comfortable"
              class="event-form__row-item"
            />
          </div>
          <VAutocomplete
            v-model="form.hcoIds"
            :label="t('rep.planner.form.fieldHco')"
            :items="hcoOptions"
            item-title="name"
            item-value="id"
            variant="outlined"
            density="comfortable"
            class="mb-3"
            multiple
            chips
            closable-chips
            :loading="loadingHco"
            :placeholder="t('rep.planner.form.fieldHcoPlaceholder')"
          />
          <VAutocomplete
            v-model="form.hcpIds"
            :label="t('rep.planner.form.fieldHcp')"
            :items="hcpOptions"
            item-title="name"
            item-value="id"
            variant="outlined"
            density="comfortable"
            class="mb-3"
            multiple
            chips
            closable-chips
            :loading="loadingHcp"
            :placeholder="t('rep.planner.form.fieldHcpPlaceholder')"
          />
          <VTextField
            v-if="form.type === 'f2f'"
            v-model="form.location"
            :label="t('rep.planner.form.fieldLocation')"
            variant="outlined"
            density="comfortable"
            class="mb-3"
            autocomplete="off"
          />
          <VTextField
            v-if="form.type === 'video'"
            v-model="form.videoLink"
            :label="t('rep.planner.form.fieldVideoLink')"
            variant="outlined"
            density="comfortable"
            class="mb-3"
            type="url"
            autocomplete="off"
          />
          <VTextField
            v-model="form.notes"
            :label="t('rep.planner.form.fieldNotes')"
            variant="outlined"
            density="comfortable"
            class="mb-3"
            autocomplete="off"
            multiline
            rows="2"
          />
          <VSelect
            v-model="form.region"
            :label="t('rep.planner.form.fieldRegion')"
            :items="configStore.regionItems"
            variant="outlined"
            density="comfortable"
            class="mb-3"
            clearable
          />
        </VForm>
      </VCardText>
      <VCardActions class="mx-2 mb-2">
        <VSpacer />
        <VBtn variant="text" @click="onCancelClick">
          {{ t("app.common.cancel") }}
        </VBtn>
        <VBtn color="primary" :loading="submitting" @click="onSubmit">
          {{ formSubmitLabel }}
        </VBtn>
      </VCardActions>
    </VCard>

    <VDialog
      v-model="showDiscardConfirm"
      max-width="360"
      content-class="event-form-dialog__content"
      persistent
    >
      <VCard>
        <VCardText>{{ t("app.common.discardChanges") }}</VCardText>
        <VCardActions>
          <VSpacer />
          <VBtn variant="text" @click="showDiscardConfirm = false">
            {{ t("app.common.cancel") }}
          </VBtn>
          <VBtn color="error" variant="text" @click="confirmDiscard">
            {{ t("app.common.discard") }}
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>
  </VDialog>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { useConfigStore } from "../stores/config";
import { useEventForm } from "../composables/useEventForm";

export interface EventFormData {
  title: string;
  start: string;
  end: string;
  type: "f2f" | "video";
  status: string;
  hcoIds: string[];
  hcpIds: string[];
  location: string;
  videoLink: string;
  notes: string;
  region: string;
}

export interface EventFormInitialData {
  id?: string;
  title?: string;
  start?: string;
  end?: string;
  start_at?: string;
  end_at?: string;
  type?: "f2f" | "video";
  status?: string;
  hcoIds?: string[];
  hcpIds?: string[];
  attendees?: { attendee_type: string; attendee_id: string }[];
  location?: string;
  video_link?: string;
  videoLink?: string;
  notes?: string;
  region?: string;
}

export interface EventSubmitPayload {
  id?: string;
  title: string;
  start_at: string;
  end_at: string;
  type: "f2f" | "video";
  status: "scheduled" | "completed" | "cancelled" | "no_show";
  location?: string | null;
  video_link?: string | null;
  notes?: string | null;
  region: string;
  attendees: { attendee_type: "hcp" | "hco" | "lead"; attendee_id: string; is_primary?: boolean }[];
}

const props = withDefaults(
  defineProps<{ modelValue: boolean; initialData?: EventFormInitialData }>(),
  { modelValue: false }
);

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  submit: [payload: EventSubmitPayload];
}>();

const { t } = useI18n();
const configStore = useConfigStore();

const {
  formRef, form, submitting, showDiscardConfirm,
  hcoOptions, hcpOptions, loadingHco, loadingHcp,
  typeItems, statusItems,
  formTitle, formSubmitLabel,
  startRules, endRules,
  onDialogUpdate, confirmDiscard, onCancelClick, onSubmit,
} = useEventForm(props, emit as (event: string, ...args: unknown[]) => void);
</script>

<style >
.event-form-dialog__content {
  border-radius: var(--rep-modal-radius, 16px) !important;
  overflow: hidden;
}

.event-form-dialog__card {
  border-radius: var(--rep-modal-radius, 16px) !important;
}

.event-form-dialog__card :deep(.v-card-title) {
  padding: 32px 24px !important;
}

.event-form-dialog__card :deep(.v-card-text) {
  padding: 24px !important;
}

.event-form-dialog__card :deep(.v-card-actions) {
  padding: 24px 24px 32px !important;
}
</style>

<style scoped>
.event-form__row {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.event-form__row-item {
  flex: 1 1 180px;
  min-width: 0;
}
</style>
