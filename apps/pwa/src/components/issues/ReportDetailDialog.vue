<template>
  <AppFormDialog
    :model-value="report !== null"
    :title="t('issues.detail.reportTitle', { number: shown?.number ?? '' })"
    max-width="640"
    @update:model-value="(v: boolean) => !v && emit('close')"
    @close="emit('close')"
  >
    <div v-if="shown" class="issues-detail" data-testid="report-detail">
      <div class="issues-detail__section">
        <span class="issues-detail__label">{{ t("issues.detail.description") }}</span>
        <p class="issues-detail__text">{{ shown.description }}</p>
      </div>

      <dl class="issues-detail__facts">
        <dt>{{ t("issues.detail.reporter") }}</dt>
        <dd>{{ reporter }}</dd>
        <template v-if="shown.tenant_slug">
          <dt>{{ t("issues.detail.tenant") }}</dt>
          <dd>{{ shown.tenant_slug }}</dd>
        </template>
        <dt>{{ t("issues.detail.page") }}</dt>
        <dd>{{ shown.page_url || "—" }}</dd>
        <dt>{{ t("issues.detail.appVersion") }}</dt>
        <dd>{{ shown.app_version || "—" }}</dd>
        <dt>{{ t("issues.detail.viewport") }}</dt>
        <dd>{{ shown.viewport || "—" }}</dd>
        <dt>{{ t("issues.detail.userAgent") }}</dt>
        <dd>{{ shown.user_agent || "—" }}</dd>
      </dl>

      <div v-if="shown.request_ids.length" class="issues-detail__section">
        <span class="issues-detail__label">{{ t("issues.detail.requestIds") }}</span>
        <ul class="issues-detail__list">
          <li v-for="id in shown.request_ids" :key="id" class="issues-detail__mono">{{ id }}</li>
        </ul>
      </div>

      <div v-if="shown.recent_errors?.length" class="issues-detail__section">
        <span class="issues-detail__label">{{ t("issues.detail.recentErrors") }}</span>
        <ul class="issues-detail__list" data-testid="report-recent-errors">
          <li v-for="(entry, i) in shown.recent_errors" :key="i" class="issues-detail__mono">{{ describeEntry(entry) }}</li>
        </ul>
      </div>

      <div v-if="shown.has_attachment" class="issues-detail__section">
        <AppButton variant="outlined" :loading="opening" data-testid="report-open-attachment" @click="openAttachment">
          <template #prepend><AppIcon name="paperclip" class="issues-detail__icon" /></template>
          {{ t("issues.detail.openAttachment") }}
        </AppButton>
        <span v-if="shown.attachment_name" class="issues-detail__label">{{ shown.attachment_name }}</span>
      </div>

      <VSelect
        v-model="status"
        :items="statusItems"
        :label="t('issues.detail.status')"
        variant="outlined"
        hide-details
        data-testid="report-status"
      />
      <VTextarea
        v-model="note"
        :label="t('issues.detail.note')"
        variant="outlined"
        rows="3"
        auto-grow
        hide-details
        data-testid="report-note"
      />
    </div>
    <template #actions>
      <VSpacer />
      <AppButton variant="text" @click="emit('close')">{{ t("app.common.close") }}</AppButton>
      <AppButton color="primary" variant="flat" :loading="saving" :disabled="!dirty" data-testid="report-save" @click="save">
        {{ t("issues.detail.save") }}
      </AppButton>
    </template>
  </AppFormDialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import AppFormDialog from "../AppFormDialog.vue";
import AppButton from "../AppButton.vue";
import AppIcon from "../AppIcon.vue";
import { fetchAttachmentUrl, patchReport } from "../../composables/useIssues";
import { useNotifications } from "../../composables/useNotifications";
import { showErrorToast } from "../../composables/useErrorToast";
import type { ProblemReport, ProblemStatus } from "../../types/issues";

const props = defineProps<{ report: ProblemReport | null }>();
const emit = defineEmits<{
  close: [];
  saved: [report: ProblemReport];
}>();

const { t } = useI18n();
const notifications = useNotifications();

/** The last report shown — keeps the content in place while the dialog animates closed. */
const shown = ref<ProblemReport | null>(props.report);
const status = ref<ProblemStatus>("new");
const note = ref("");
const saving = ref(false);
const opening = ref(false);

watch(
  () => props.report,
  (report) => {
    if (!report) return;
    shown.value = report;
    status.value = report.status;
    note.value = report.admin_note ?? "";
  },
  { immediate: true },
);

const statusItems = computed(() =>
  (["new", "in_progress", "resolved", "dismissed"] as const).map((value) => ({ value, title: t(`issues.status.${value}`) })),
);
const reporter = computed(() => {
  const r = shown.value;
  if (!r) return "";
  return [r.reporter_name, r.reporter_email, r.reporter_role].filter(Boolean).join(" · ") || t("issues.reporterUnknown");
});
const dirty = computed(() => !!shown.value && (status.value !== shown.value.status || note.value !== (shown.value.admin_note ?? "")));

function describeEntry(entry: Record<string, unknown>): string {
  return Object.entries(entry)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(" ");
}

async function save(): Promise<void> {
  const current = shown.value;
  if (!current || saving.value) return;
  saving.value = true;
  try {
    const updated = await patchReport(current.id, { status: status.value, admin_note: note.value });
    notifications.show(t("issues.detail.saved", { number: current.number }), "success");
    emit("saved", updated);
  } catch (err) {
    showErrorToast(err);
  } finally {
    saving.value = false;
  }
}

async function openAttachment(): Promise<void> {
  const current = shown.value;
  if (!current || opening.value) return;
  opening.value = true;
  try {
    const url = await fetchAttachmentUrl(current.id);
    window.open(url, "_blank", "noopener");
  } catch (err) {
    showErrorToast(err);
  } finally {
    opening.value = false;
  }
}
</script>

<style scoped src="./issues.css"></style>

<style scoped>
.issues-detail__icon {
  width: 20px;
  height: 20px;
}
</style>
