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
          <VTextField
            v-model="form.region"
            :label="t('rep.planner.form.fieldRegion')"
            variant="outlined"
            density="comfortable"
            class="mb-3"
            autocomplete="off"
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
import { ref, computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import { bffFetch } from "../composables/useBffApi";

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

/** Map UI status to API status. */
const UI_TO_API_STATUS: Record<string, "scheduled" | "completed" | "cancelled" | "no_show"> = {
  planned: "scheduled",
  done: "completed",
  rejected: "cancelled",
  no_show: "no_show",
};

/** Map API status to UI status. */
const API_TO_UI_STATUS: Record<string, string> = {
  scheduled: "planned",
  completed: "done",
  cancelled: "rejected",
  no_show: "no_show",
};

/** Initial data for create (prefilled date) or edit (from API). */
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

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    /** When provided, form is in edit mode or create with prefilled date. */
    initialData?: EventFormInitialData;
  }>(),
  { modelValue: false }
);

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

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  submit: [payload: EventSubmitPayload];
}>();

const { t } = useI18n();
const formRef = ref<{ validate: () => Promise<{ valid: boolean }> } | null>(null);
const submitting = ref(false);
const showDiscardConfirm = ref(false);
/** Snapshot of form when dialog opened – used to detect real changes. */
const initialFormSnapshot = ref<EventFormData | null>(null);
const hcoOptions = ref<{ id: string; name: string }[]>([]);
const hcpOptions = ref<{ id: string; name: string }[]>([]);
const loadingHco = ref(false);
const loadingHcp = ref(false);

const form = ref<EventFormData>({
  title: "",
  start: "",
  end: "",
  type: "f2f",
  status: "planned",
  hcoIds: [],
  hcpIds: [],
  location: "",
  videoLink: "",
  notes: "",
  region: "",
});

const typeItems = computed(() => [
  { title: t("rep.planner.form.typeF2f"), value: "f2f" },
  { title: t("rep.planner.form.typeVideo"), value: "video" },
]);

const statusItems = computed(() => [
  { title: t("rep.planner.form.statusPlanned"), value: "planned" },
  { title: t("rep.planner.form.statusDone"), value: "done" },
  { title: t("rep.planner.form.statusRejected"), value: "rejected" },
  { title: t("rep.planner.form.statusNoShow"), value: "no_show" },
]);

const isEditMode = computed(() => !!props.initialData?.id);

const formTitle = computed(() =>
  isEditMode.value ? t("rep.planner.form.editTitle") : t("rep.planner.form.title")
);

const formSubmitLabel = computed(() =>
  isEditMode.value ? t("rep.planner.form.editSubmit") : t("rep.planner.form.submit")
);

const startRules = computed(() => [
  (v: string) => !!v?.trim() || t("rep.planner.form.validation.startRequired"),
]);

const endRules = computed(() => [
  (v: string) => !!v?.trim() || t("rep.planner.form.validation.endRequired"),
  (v: string) => {
    const start = form.value.start?.trim();
    const end = v?.trim();
    if (!start || !end) return true;
    return new Date(end) > new Date(start) || t("rep.planner.form.validation.endAfterStart");
  },
]);

function toDatetimeLocal(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocal(local: string): string {
  if (!local?.trim()) return "";
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

async function loadHco() {
  loadingHco.value = true;
  try {
    const res = await bffFetch("/api/hco?limit=-1", { handleErrors: false });
    if (res.ok) {
      const json = (await res.json()) as { items?: { id: string; name: string }[] };
      hcoOptions.value = json.items ?? [];
    }
  } finally {
    loadingHco.value = false;
  }
}

async function loadHcp() {
  loadingHcp.value = true;
  try {
    const res = await bffFetch("/api/hcp?limit=-1", { handleErrors: false });
    if (res.ok) {
      const json = (await res.json()) as { items?: { id: string; name: string }[] };
      hcpOptions.value = json.items ?? [];
    }
  } finally {
    loadingHcp.value = false;
  }
}

function hasFormChanged(): boolean {
  const snap = initialFormSnapshot.value;
  if (!snap) return false;
  const f = form.value;
  const eq = (a: string, b: string) => (a ?? "").trim() === (b ?? "").trim();
  return (
    !eq(f.title, snap.title) ||
    !eq(f.start, snap.start) ||
    !eq(f.end, snap.end) ||
    f.type !== snap.type ||
    f.status !== snap.status ||
    JSON.stringify([...f.hcoIds].sort()) !== JSON.stringify([...snap.hcoIds].sort()) ||
    JSON.stringify([...f.hcpIds].sort()) !== JSON.stringify([...snap.hcpIds].sort()) ||
    !eq(f.location, snap.location) ||
    !eq(f.videoLink, snap.videoLink) ||
    !eq(f.notes, snap.notes) ||
    !eq(f.region, snap.region)
  );
}

function onDialogUpdate(value: boolean) {
  if (value === false && hasFormChanged()) {
    showDiscardConfirm.value = true;
  } else {
    emit("update:modelValue", value);
  }
}

function confirmDiscard() {
  showDiscardConfirm.value = false;
  emit("update:modelValue", false);
}

function onCancelClick() {
  if (hasFormChanged()) {
    showDiscardConfirm.value = true;
  } else {
    emit("update:modelValue", false);
  }
}

async function onSubmit() {
  const valid = await formRef.value?.validate();
  if (!valid?.valid) return;
  submitting.value = true;
  try {
    const attendees: { attendee_type: "hcp" | "hco" | "lead"; attendee_id: string; is_primary?: boolean }[] = [];
    for (const id of form.value.hcoIds) {
      attendees.push({ attendee_type: "hco", attendee_id: id, is_primary: false });
    }
    for (const id of form.value.hcpIds) {
      attendees.push({ attendee_type: "hcp", attendee_id: id, is_primary: false });
    }
    const apiStatus = UI_TO_API_STATUS[form.value.status] ?? "scheduled";
    const payload: EventSubmitPayload = {
      id: props.initialData?.id,
      title: form.value.title.trim(),
      start_at: fromDatetimeLocal(form.value.start),
      end_at: fromDatetimeLocal(form.value.end),
      type: form.value.type,
      status: apiStatus,
      location: form.value.location.trim() || null,
      video_link: form.value.videoLink.trim() || null,
      notes: form.value.notes.trim() || null,
      region: form.value.region.trim(),
      attendees,
    };
    emit("submit", payload);
    emit("update:modelValue", false);
  } finally {
    submitting.value = false;
  }
}

function getHcoHcpFromAttendees(attendees?: { attendee_type: string; attendee_id: string }[]): {
  hcoIds: string[];
  hcpIds: string[];
} {
  const hcoIds: string[] = [];
  const hcpIds: string[] = [];
  for (const a of attendees ?? []) {
    if (a.attendee_type === "hco") hcoIds.push(a.attendee_id);
    if (a.attendee_type === "hcp") hcpIds.push(a.attendee_id);
  }
  return { hcoIds, hcpIds };
}

watch(
  () => [props.modelValue, props.initialData] as const,
  ([open, initial]) => {
    if (open) {
      loadHco();
      loadHcp();
      if (initial && (initial.id || initial.start || initial.end || initial.start_at || initial.end_at)) {
        const startIso = initial.start ?? initial.start_at ?? "";
        const endIso = initial.end ?? initial.end_at ?? "";
        const { hcoIds, hcpIds } = initial.hcoIds || initial.hcpIds
          ? { hcoIds: initial.hcoIds ?? [], hcpIds: initial.hcpIds ?? [] }
          : getHcoHcpFromAttendees(initial.attendees);
        form.value = {
          title: (initial.title ?? "").trim(),
          start: toDatetimeLocal(startIso),
          end: toDatetimeLocal(endIso),
          type: initial.type === "video" ? "video" : "f2f",
          status: initial.status ? (API_TO_UI_STATUS[initial.status] ?? initial.status) : "planned",
          hcoIds: [...hcoIds],
          hcpIds: [...hcpIds],
          location: (initial.location ?? "").trim(),
          videoLink: (initial.videoLink ?? initial.video_link ?? "").trim(),
          notes: (initial.notes ?? "").trim(),
          region: (initial.region ?? "").trim(),
        };
      } else {
        form.value = {
          title: "",
          start: "",
          end: "",
          type: "f2f",
          status: "planned",
          hcoIds: [],
          hcpIds: [],
          location: "",
          videoLink: "",
          notes: "",
          region: "",
        };
      }
      initialFormSnapshot.value = { ...form.value };
    } else {
      initialFormSnapshot.value = null;
    }
  }
);
</script>

<style lang="scss" scoped>
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

<style lang="scss">
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
