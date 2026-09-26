<template>
  <AppFormDialog
    :model-value="modelValue"
    :title="formTitle"
    avatar-entity-type="event"
    :avatar-name="form.title"
    @update:model-value="onDialogUpdate"
    @close="onCancelClick"
  >
    <VForm ref="formRef" @submit.prevent="onSubmit">
      <FormErrorSummary :errors="errorList" :title="t('app.formRenderer.errorSummary.title', { n: errorList.length })" @select="focusField" />
      <VTextField
        :ref="(el) => setFieldEl('title', el)"
        v-model="form.title"
        :error-messages="serverError('title')"
        :label="t('user.planner.form.fieldTitle')"
        variant="outlined"
        density="comfortable"
        class="mb-3"
        autocomplete="off"
      />
      <div class="pwa-form-row mb-3">
        <VTextField
          :ref="(el) => setFieldEl('start', el)"
        v-model="form.start"
        :error-messages="serverError('start')"
          :label="t('user.planner.form.fieldStart')"
          type="datetime-local"
          variant="outlined"
          density="comfortable"
          class="pwa-form-row-item"
          :rules="startRules"
        />
        <VTextField
          :ref="(el) => setFieldEl('end', el)"
        v-model="form.end"
        :error-messages="serverError('end')"
          :label="t('user.planner.form.fieldEnd')"
          type="datetime-local"
          variant="outlined"
          density="comfortable"
          class="pwa-form-row-item"
          :rules="endRules"
        />
      </div>
      <div class="pwa-form-row mb-3">
        <VSelect
          :ref="(el) => setFieldEl('type', el)"
        v-model="form.type"
        :error-messages="serverError('type')"
          :label="t('user.planner.form.fieldType')"
          :items="typeItems"
          item-title="title"
          item-value="value"
          variant="outlined"
          density="comfortable"
          class="pwa-form-row-item"
        />
        <VSelect
          :ref="(el) => setFieldEl('status', el)"
        v-model="form.status"
        :error-messages="serverError('status')"
          :label="t('user.planner.form.fieldStatus')"
          :items="statusItems"
          item-title="title"
          item-value="value"
          variant="outlined"
          density="comfortable"
          class="pwa-form-row-item"
        />
      </div>
      <VAutocomplete
        v-model="form.hcoIds"
        :label="t('user.planner.form.fieldHco')"
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
        :placeholder="t('user.planner.form.fieldHcoPlaceholder')"
      >
        <template #item="{ internalItem: item, props: itemProps }">
          <VListItem v-if="item.value" v-bind="itemProps" :title="item.raw.name">
            <template #prepend>
              <AppAvatar :name="item.raw.name" entity-type="hco" :size="28" />
            </template>
          </VListItem>
        </template>
        <template #chip="{ internalItem: item, props: chipProps }">
          <VChip v-if="item.value" v-bind="chipProps" :text="item.raw.name">
            <template #prepend>
              <AppAvatar :name="item.raw.name" entity-type="hco" :size="18" class="mr-1" />
            </template>
          </VChip>
        </template>
      </VAutocomplete>
      <VAutocomplete
        v-model="form.hcpIds"
        :label="t('user.planner.form.fieldHcp')"
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
        :placeholder="t('user.planner.form.fieldHcpPlaceholder')"
      >
        <template #prepend-inner>
          <AppIcon name="nav-hcp" class="pwa-form-field-icon" />
        </template>
        <template #item="{ internalItem: item, props: itemProps }">
          <VListItem v-if="item.value" v-bind="itemProps" :title="item.raw.name">
            <template #prepend>
              <AppAvatar :name="item.raw.name" entity-type="hcp" :size="28" />
            </template>
          </VListItem>
        </template>
        <template #chip="{ internalItem: item, props: chipProps }">
          <VChip v-if="item.value" v-bind="chipProps" :text="item.raw.name">
            <template #prepend>
              <AppAvatar :name="item.raw.name" entity-type="hcp" :size="18" class="mr-1" />
            </template>
          </VChip>
        </template>
      </VAutocomplete>
      <VAutocomplete
        v-model="form.patientIds"
        :label="t('user.planner.form.fieldPatient')"
        :items="patientOptions"
        item-title="name"
        item-value="id"
        variant="outlined"
        density="comfortable"
        class="mb-3"
        multiple
        chips
        closable-chips
        :loading="loadingPatient"
        :placeholder="t('user.planner.form.fieldPatientPlaceholder')"
      >
        <template #item="{ internalItem: item, props: itemProps }">
          <VListItem v-if="item.value" v-bind="itemProps" :title="item.raw.name">
            <template #prepend>
              <AppAvatar :name="item.raw.name" entity-type="patient" :size="28" />
            </template>
          </VListItem>
        </template>
        <template #chip="{ internalItem: item, props: chipProps }">
          <VChip v-if="item.value" v-bind="chipProps" :text="item.raw.name">
            <template #prepend>
              <AppAvatar :name="item.raw.name" entity-type="patient" :size="18" class="mr-1" />
            </template>
          </VChip>
        </template>
      </VAutocomplete>
      <VTextField
        v-if="form.type === 'f2f'"
        :ref="(el) => setFieldEl('location', el)"
        v-model="form.location"
        :error-messages="serverError('location')"
        :label="t('user.planner.form.fieldLocation')"
        variant="outlined"
        density="comfortable"
        class="mb-3"
        autocomplete="off"
      />
      <VTextField
        v-if="form.type === 'video'"
        :ref="(el) => setFieldEl('videoLink', el)"
        v-model="form.videoLink"
        :error-messages="serverError('videoLink')"
        :label="t('user.planner.form.fieldVideoLink')"
        variant="outlined"
        density="comfortable"
        class="mb-3"
        type="url"
        autocomplete="off"
      />
      <VTextField
        :ref="(el) => setFieldEl('notes', el)"
        v-model="form.notes"
        :error-messages="serverError('notes')"
        :label="t('user.planner.form.fieldNotes')"
        variant="outlined"
        density="comfortable"
        class="mb-3"
        autocomplete="off"
        multiline
        rows="2"
      />
      <VSelect
        :ref="(el) => setFieldEl('region', el)"
        v-model="form.region"
        :error-messages="serverError('region')"
        :label="t('user.planner.form.fieldRegion')"
        :items="configStore.regionItems"
        variant="outlined"
        density="comfortable"
        class="mb-3"
        clearable
      />
    </VForm>

    <template #actions>
      <VSpacer />
      <AppButton variant="text" @click="onCancelClick">
        {{ t("app.common.cancel") }}
      </AppButton>
      <AppButton color="primary" variant="flat" :loading="submitting" @click="onSubmit">
        {{ formSubmitLabel }}
      </AppButton>
    </template>

    <template #overlays>
      <AppConfirmDialog
        v-model="showDiscardConfirm"
        :text="t('app.common.discardChanges')"
        :secondary-label="t('app.common.cancel')"
        :secondary-color="null"
        :primary-label="t('app.common.discard')"
        primary-color="error"
        primary-variant="text"
        max-width="360"
        @secondary="showDiscardConfirm = false"
        @primary="confirmDiscard"
      />
    </template>
  </AppFormDialog>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { useConfigStore } from "../stores/config";
import { useEventForm } from "../composables/useEventForm";
import AppButton from "./AppButton.vue";
import AppAvatar from "./AppAvatar.vue";
import AppFormDialog from "./AppFormDialog.vue";
import AppConfirmDialog from "./AppConfirmDialog.vue";
import AppIcon from "./AppIcon.vue";
import { FormErrorSummary } from "@ui";
import type { SubmitDone } from "../composables/useEntitySubmit";

export interface EventFormData {
  title: string;
  start: string;
  end: string;
  type: "f2f" | "video";
  status: string;
  hcoIds: string[];
  hcpIds: string[];
  patientIds: string[];
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
  patientIds?: string[];
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
  attendees: { attendee_type: "doctor" | "hco" | "lead" | "patient"; attendee_id: string; is_primary?: boolean }[];
}

const props = withDefaults(
  defineProps<{ modelValue?: boolean; initialData?: EventFormInitialData }>(),
  { modelValue: false }
);

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  /**
   * `done` must be called once the caller's apiFetch settles — true closes the dialog, false keeps it
   * open to retry; `fieldErrors` (a 400 naming a payload key) marks that field in the form (NEO-109).
   */
  submit: [payload: EventSubmitPayload, done: SubmitDone];
}>();

const { t } = useI18n();
const configStore = useConfigStore();

const {
  formRef, form, submitting, showDiscardConfirm,
  hcoOptions, hcpOptions, patientOptions, loadingHco, loadingHcp, loadingPatient,
  typeItems, statusItems,
  formTitle, formSubmitLabel,
  startRules, endRules,
  errorList, serverError, setFieldEl, focusField,
  onDialogUpdate, confirmDiscard, onCancelClick, onSubmit,
} = useEventForm(props, emit as (event: string, ...args: unknown[]) => void);
</script>

<!-- .pwa-form-dialog__*/.pwa-form-row* are shared, global classes — see assets/theme.scss -->

