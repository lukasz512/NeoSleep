<template>
  <div class="patient-studies-panel">
    <FormRenderer
      v-model="showAddModal"
      :fields="sleepStudyFormFields"
      title-key="app.sleepStudies.form.title"
      submit-label-key="app.sleepStudies.form.submit"
      @submit="onAddSubmit"
    />
    <FormRenderer
      v-model="showEditModal"
      :fields="sleepStudyFormFields"
      :initial-data="selectedStudy ?? undefined"
      title-key="app.sleepStudies.form.title"
      edit-title-key="app.sleepStudies.form.editTitle"
      submit-label-key="app.sleepStudies.form.submit"
      edit-submit-label-key="app.sleepStudies.form.editSubmit"
      @submit="onEditSubmit"
    />

    <div class="patient-studies-panel__toolbar">
      <AppButton color="primary" variant="tonal" @click="showAddModal = true">
        <template #prepend><AppIcon name="plus" /></template>
        {{ t("app.sleepStudies.form.title") }}
      </AppButton>
    </div>

    <AppLoadingState v-if="loading && !loaded" />
    <AppErrorState
      v-else-if="loadError"
      :title="t('app.errorState.title')"
      :subtitle="t('app.sleepStudies.errorLoad')"
      :refresh-label="t('app.errorState.refresh')"
      :loading="loading"
      @refresh="loadStudies"
    />
    <AppEmptyState v-else-if="studies.length === 0" :title="t('app.sleepStudies.emptyTitle')" :subtitle="t('app.sleepStudies.emptySubtitle')" />
    <ul v-else class="patient-studies-panel__list">
      <li v-for="study in studies" :key="study.id" class="patient-studies-panel__item" @click="onEdit(study)">
        <div class="patient-studies-panel__item-header">
          <span class="patient-studies-panel__date">{{ study.study_date ? new Date(study.study_date).toLocaleDateString() : "—" }}</span>
          <VChip :color="statusColor(study.status)" size="small" variant="tonal">{{ statusLabel(study.status) }}</VChip>
          <AppButton
            v-if="isAdmin"
            icon
            variant="text"
            size="small"
            class="patient-studies-panel__delete-btn"
            :aria-label="t('app.common.remove')"
            @click.stop="askDelete(study.id)"
          >
            <AppIcon name="trash" />
          </AppButton>
        </div>
        <div class="patient-studies-panel__metrics">
          <span v-if="study.ahi_score != null">AHI {{ study.ahi_score }}</span>
          <span v-if="study.spo2_nadir != null">SpO2 {{ study.spo2_nadir }}%</span>
          <span v-if="study.odi != null">ODI {{ study.odi }}</span>
        </div>
        <p v-if="study.interpretation" class="patient-studies-panel__interpretation">
          <strong>{{ t("app.sleepStudies.detail.interpretation") }}:</strong> {{ study.interpretation }}
        </p>
        <div class="patient-studies-panel__attachments">
          <div v-for="att in attachmentsByStudy[study.id] || []" :key="att.id" class="patient-studies-panel__attachment">
            <AppIcon name="file-pdf" class="patient-studies-panel__attachment-icon" />
            <button type="button" class="patient-studies-panel__attachment-name" @click.stop="onDownloadAttachment(att.id, study.id)">
              {{ att.filename }}
            </button>
            <AppButton
              icon
              variant="text"
              size="small"
              :aria-label="t('app.common.remove')"
              @click.stop="onDeleteAttachment(att.id, study.id)"
            >
              <AppIcon name="trash" />
            </AppButton>
          </div>
          <AppButton
            variant="text"
            size="small"
            class="patient-studies-panel__attach-btn"
            :loading="uploadingStudyId === study.id"
            @click.stop="triggerUpload(study.id)"
          >
            <template #prepend><AppIcon name="file-pdf" /></template>
            {{ t("app.sleepStudies.attachments.upload") }}
          </AppButton>
        </div>
      </li>
    </ul>

    <input
      ref="fileInputEl"
      type="file"
      accept="application/pdf"
      class="patient-studies-panel__file-input"
      @click.stop
      @change="onFileChange"
    />

    <VDialog v-model="showDeleteConfirm" max-width="400" :transition="originDialogTransition">
      <VCard>
        <VCardText>{{ t("app.sleepStudies.deleteConfirmText") }}</VCardText>
        <VCardActions>
          <VSpacer />
          <AppButton variant="text" @click="showDeleteConfirm = false">{{ t("app.common.cancel") }}</AppButton>
          <AppButton color="error" variant="text" :loading="deleteLoading" @click="onConfirmDelete">
            {{ t("app.common.remove") }}
          </AppButton>
        </VCardActions>
      </VCard>
    </VDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import { useI18n } from "vue-i18n";
import { defineAsyncComponent } from "vue";
import { originDialogTransition } from "@ui";
import AppButton from "../AppButton.vue";
import AppIcon from "../AppIcon.vue";
import AppLoadingState from "../AppLoadingState.vue";
import AppErrorState from "../AppErrorState.vue";
import AppEmptyState from "../AppEmptyState.vue";
import { apiFetch, extractErrorMessage } from "../../composables/useApi";
import { useNotifications } from "../../composables/useNotifications";
import { useAsyncAction } from "../../composables/useAsyncAction";
import { useAuthStore } from "../../stores/auth";
import { sleepStudyFormFields } from "../../config/forms/sleepStudyForm";

const FormRenderer = defineAsyncComponent(() => import("../FormRenderer.vue"));

const props = defineProps<{ patientId: string }>();

export interface SleepStudyItem {
  id: string;
  study_date: string | null;
  status: string;
  ahi_score: number | null;
  spo2_nadir: number | null;
  odi: number | null;
  interpretation: string | null;
}

interface AttachmentItem {
  id: string;
  filename: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  uploadedAt: string;
}

const { t } = useI18n();
const notifications = useNotifications();
const authStore = useAuthStore();
const isAdmin = computed(() => authStore.user?.role === "admin");

const studies = ref<SleepStudyItem[]>([]);
const loading = ref(false);
const loaded = ref(false);
const loadError = ref(false);
const showAddModal = ref(false);
const showEditModal = ref(false);
const selectedStudy = ref<SleepStudyItem | null>(null);

// Manual PDF attachment upload (2026-09) — narrow first cut: results PDF
// only, uploaded by hand. A richer flow (device/lab webhook writing
// straight into sleep_study.raw_results) is future work, not this.
const attachmentsByStudy = ref<Record<string, AttachmentItem[]>>({});
const uploadingStudyId = ref<string | null>(null);
const fileInputEl = ref<HTMLInputElement | null>(null);
const uploadTargetStudyId = ref<string | null>(null);

async function loadAttachmentsFor(studyId: string) {
  const res = await apiFetch(`/api/v1/sleep-study/${studyId}/attachments`, { handleErrors: false });
  if (res.ok) {
    const data = (await res.json()) as { items: AttachmentItem[] };
    attachmentsByStudy.value = { ...attachmentsByStudy.value, [studyId]: data.items };
  }
}

async function loadStudies() {
  loading.value = true;
  loadError.value = false;
  try {
    const res = await apiFetch(`/api/v1/sleep-study?patient_id=${props.patientId}&limit=-1`, { handleErrors: false });
    if (res.ok) {
      const data = (await res.json()) as { items: SleepStudyItem[] };
      studies.value = data.items;
      await Promise.all(studies.value.map((s) => loadAttachmentsFor(s.id)));
    } else {
      loadError.value = true;
    }
  } catch {
    loadError.value = true;
  } finally {
    loading.value = false;
    loaded.value = true;
  }
}

function triggerUpload(studyId: string) {
  uploadTargetStudyId.value = studyId;
  fileInputEl.value?.click();
}

async function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  const studyId = uploadTargetStudyId.value;
  input.value = ""; // reset so re-selecting the same file re-fires change
  if (!file || !studyId) return;

  if (file.type !== "application/pdf") {
    notifications.show(t("app.sleepStudies.attachments.errorType"), "error");
    return;
  }

  uploadingStudyId.value = studyId;
  try {
    const formData = new FormData();
    formData.append("file", file);
    const res = await apiFetch(`/api/v1/sleep-study/${studyId}/attachments`, {
      method: "POST",
      body: formData,
      handleErrors: false,
    });
    if (res.ok) {
      notifications.show(t("app.sleepStudies.attachments.uploadSuccess"), "success");
      await loadAttachmentsFor(studyId);
    } else {
      // Prefer the server's own message (e.g. "Storage not configured — set
      // SUPABASE_URL and SUPABASE_SERVICE_KEY") over the generic translated
      // fallback — handleErrors:false above means the global handler won't
      // show it, so this is the only place it surfaces.
      const bodyText = await res.text().catch(() => "");
      const serverMessage = extractErrorMessage(bodyText);
      notifications.show(serverMessage || t("app.sleepStudies.attachments.errorUpload"), "error");
    }
  } catch {
    notifications.show(t("app.sleepStudies.attachments.errorUpload"), "error");
  } finally {
    uploadingStudyId.value = null;
  }
}

async function onDownloadAttachment(attachmentId: string, studyId: string) {
  const res = await apiFetch(`/api/v1/sleep-study/${studyId}/attachments/${attachmentId}/download`, { handleErrors: false });
  if (res.ok) {
    const { url } = (await res.json()) as { url: string };
    window.open(url, "_blank", "noopener");
  }
}

async function onDeleteAttachment(attachmentId: string, studyId: string) {
  if (!window.confirm(t("app.sleepStudies.attachments.deleteConfirmText"))) return;
  const res = await apiFetch(`/api/v1/sleep-study/${studyId}/attachments/${attachmentId}`, {
    method: "DELETE",
    handleErrors: false,
  });
  if (res.ok) {
    attachmentsByStudy.value = {
      ...attachmentsByStudy.value,
      [studyId]: (attachmentsByStudy.value[studyId] ?? []).filter((a) => a.id !== attachmentId),
    };
  } else {
    notifications.show(t("app.sleepStudies.attachments.errorDelete"), "error");
  }
}

function statusColor(status: string): string {
  switch (status) {
    case "interpreted": return "success";
    case "results_received":
    case "study_complete": return "info";
    case "cancelled": return "default";
    default: return "warning";
  }
}

function statusLabel(status: string): string {
  const key = `app.sleepStudies.status.${status.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())}`;
  return t(key);
}

async function onAddSubmit(data: Record<string, unknown>, done: (ok: boolean) => void) {
  try {
    const res = await apiFetch("/api/v1/sleep-study", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, patient_id: props.patientId }),
    });
    if (res.ok) {
      notifications.show(t("app.sleepStudies.form.success"), "success");
      await loadStudies();
      done(true);
    } else {
      done(false);
    }
  } catch {
    done(false);
  }
}

function onEdit(study: SleepStudyItem) {
  selectedStudy.value = study;
  showEditModal.value = true;
}

async function onEditSubmit(data: Record<string, unknown>, done: (ok: boolean) => void) {
  const id = selectedStudy.value?.id;
  if (!id) { done(false); return; }
  try {
    const res = await apiFetch(`/api/v1/sleep-study/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      notifications.show(t("app.sleepStudies.form.editSuccess"), "success");
      await loadStudies();
      done(true);
    } else {
      done(false);
    }
  } catch {
    done(false);
  }
}

const showDeleteConfirm = ref(false);
const pendingDeleteId = ref<string | null>(null);

function askDelete(studyId: string) {
  pendingDeleteId.value = studyId;
  showDeleteConfirm.value = true;
}

const { loading: deleteLoading, run: onConfirmDelete } = useAsyncAction(async () => {
  const id = pendingDeleteId.value;
  if (!id) return;
  const res = await apiFetch(`/api/v1/sleep-study/${id}`, { method: "DELETE", handleErrors: false });
  if (res.ok) {
    notifications.show(t("app.sleepStudies.deleteSuccess"), "success");
    showDeleteConfirm.value = false;
    pendingDeleteId.value = null;
    await loadStudies();
  } else {
    const bodyText = await res.text().catch(() => "");
    notifications.show(extractErrorMessage(bodyText) || t("app.sleepStudies.errorDelete"), "error");
  }
});

onMounted(loadStudies);
watch(() => props.patientId, loadStudies);
</script>

<style scoped>
.patient-studies-panel__toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 16px;
}


.patient-studies-panel__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.patient-studies-panel__item {
  padding: 12px 16px;
  border-radius: var(--pwa-radius);
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  cursor: pointer;
}
.patient-studies-panel__item:hover {
  background: rgba(var(--v-theme-on-surface), 0.04);
}

.patient-studies-panel__item-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}

.patient-studies-panel__delete-btn {
  margin-left: auto;
}

.patient-studies-panel__date {
  font-weight: 600;
  font-size: 0.9375rem;
}

.patient-studies-panel__metrics {
  display: flex;
  gap: 16px;
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  margin-bottom: 6px;
}

.patient-studies-panel__interpretation {
  margin: 0;
  font-size: 0.875rem;
  white-space: pre-wrap;
}

.patient-studies-panel__attachments {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}

.patient-studies-panel__attachment {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 6px 4px 10px;
  border-radius: 999px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  background: rgba(var(--v-theme-on-surface), 0.03);
}

.patient-studies-panel__attachment-icon {
  color: rgb(var(--v-theme-primary));
  flex-shrink: 0;
}

.patient-studies-panel__attachment-name {
  font-size: 0.8125rem;
  color: rgb(var(--v-theme-primary));
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  text-decoration: none;
}
.patient-studies-panel__attachment-name:hover {
  text-decoration: underline;
}

.patient-studies-panel__file-input {
  display: none;
}
</style>
