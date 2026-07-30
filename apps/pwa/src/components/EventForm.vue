<template>
  <VDialog
    :model-value="modelValue"
    max-width="680"
    content-class="pwa-form-dialog__content"
    class="event-form-dialog"
    :transition="originDialogTransition"
    @update:model-value="onDialogUpdate"
  >
    <VCard class="pwa-form-dialog__card">
      <VCardTitle class="mx-2 mt-2 text-h6 pwa-form-dialog__title-row">
        <AppAvatar :name="form.title" entity-type="event" :size="40" />
        <span>{{ formTitle }}</span>
      </VCardTitle>
      <VCardText>
        <VForm ref="formRef" @submit.prevent="onSubmit">
          <VTextField
            v-model="form.title"
            :label="t('user.planner.form.fieldTitle')"
            variant="outlined"
            density="comfortable"
            class="mb-3"
            autocomplete="off"
          />
          <div class="pwa-form-row mb-3">
            <VTextField
              v-model="form.start"
              :label="t('user.planner.form.fieldStart')"
              type="datetime-local"
              variant="outlined"
              density="comfortable"
              class="pwa-form-row-item"
              :rules="startRules"
            />
            <VTextField
              v-model="form.end"
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
              v-model="form.type"
              :label="t('user.planner.form.fieldType')"
              :items="typeItems"
              item-title="title"
              item-value="value"
              variant="outlined"
              density="comfortable"
              class="pwa-form-row-item"
            />
            <VSelect
              v-model="form.status"
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
            <template #item="{ item, props: itemProps }">
              <VListItem v-if="item.value" v-bind="itemProps" :title="item.raw.name">
                <template #prepend>
                  <AppAvatar :name="item.raw.name" entity-type="hco" :size="28" />
                </template>
              </VListItem>
            </template>
            <template #chip="{ item, props: chipProps }">
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
            <template #item="{ item, props: itemProps }">
              <VListItem v-if="item.value" v-bind="itemProps" :title="item.raw.name">
                <template #prepend>
                  <AppAvatar :name="item.raw.name" entity-type="hcp" :size="28" />
                </template>
              </VListItem>
            </template>
            <template #chip="{ item, props: chipProps }">
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
            <template #item="{ item, props: itemProps }">
              <VListItem v-if="item.value" v-bind="itemProps" :title="item.raw.name">
                <template #prepend>
                  <AppAvatar :name="item.raw.name" entity-type="patient" :size="28" />
                </template>
              </VListItem>
            </template>
            <template #chip="{ item, props: chipProps }">
              <VChip v-if="item.value" v-bind="chipProps" :text="item.raw.name">
                <template #prepend>
                  <AppAvatar :name="item.raw.name" entity-type="patient" :size="18" class="mr-1" />
                </template>
              </VChip>
            </template>
          </VAutocomplete>
          <VTextField
            v-if="form.type === 'f2f'"
            v-model="form.location"
            :label="t('user.planner.form.fieldLocation')"
            variant="outlined"
            density="comfortable"
            class="mb-3"
            autocomplete="off"
          />
          <VTextField
            v-if="form.type === 'video'"
            v-model="form.videoLink"
            :label="t('user.planner.form.fieldVideoLink')"
            variant="outlined"
            density="comfortable"
            class="mb-3"
            type="url"
            autocomplete="off"
          />
          <VTextField
            v-model="form.notes"
            :label="t('user.planner.form.fieldNotes')"
            variant="outlined"
            density="comfortable"
            class="mb-3"
            autocomplete="off"
            multiline
            rows="2"
          />
          <VSelect
            v-model="form.region"
            :label="t('user.planner.form.fieldRegion')"
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
        <AppButton variant="text" @click="onCancelClick">
          {{ t("app.common.cancel") }}
        </AppButton>
        <AppButton color="primary" :loading="submitting" @click="onSubmit">
          {{ formSubmitLabel }}
        </AppButton>
      </VCardActions>
    </VCard>

    <VDialog
      v-model="showDiscardConfirm"
      max-width="360"
      content-class="pwa-form-dialog__content"
      class="pwa-discard-dialog"
      :transition="originDialogTransition"
      persistent
    >
      <VCard class="pwa-confirm-dialog__card">
        <VCardText>{{ t("app.common.discardChanges") }}</VCardText>
        <VCardActions>
          <VSpacer />
          <AppButton variant="text" @click="showDiscardConfirm = false">
            {{ t("app.common.cancel") }}
          </AppButton>
          <AppButton color="error" variant="text" @click="confirmDiscard">
            {{ t("app.common.discard") }}
          </AppButton>
        </VCardActions>
      </VCard>
    </VDialog>
  </VDialog>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { originDialogTransition } from "@ui";
import { useConfigStore } from "../stores/config";
import { useEventForm } from "../composables/useEventForm";
import AppButton from "./AppButton.vue";
import AppAvatar from "./AppAvatar.vue";
import AppIcon from "./AppIcon.vue";

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
  defineProps<{ modelValue: boolean; initialData?: EventFormInitialData }>(),
  { modelValue: false }
);

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  /** `done` must be called once the caller's apiFetch settles — true closes the dialog, false keeps it open to retry. */
  submit: [payload: EventSubmitPayload, done: (ok: boolean) => void];
}>();

const { t } = useI18n();
const configStore = useConfigStore();

const {
  formRef, form, submitting, showDiscardConfirm,
  hcoOptions, hcpOptions, patientOptions, loadingHco, loadingHcp, loadingPatient,
  typeItems, statusItems,
  formTitle, formSubmitLabel,
  startRules, endRules,
  onDialogUpdate, confirmDiscard, onCancelClick, onSubmit,
} = useEventForm(props, emit as (event: string, ...args: unknown[]) => void);
</script>

<!-- .pwa-form-dialog__*/.pwa-form-row* are shared, global classes — see assets/theme.scss -->

