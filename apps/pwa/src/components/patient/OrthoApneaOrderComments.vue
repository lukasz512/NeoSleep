<template>
  <div class="oa-comments">
    <VTextarea
      v-model="draft"
      :label="t('app.notes.placeholder')"
      variant="outlined"
      density="comfortable"
      rows="2"
      auto-grow
      hide-details
    />
    <div class="oa-comments__notify">
      <VCheckbox v-model="notifyOrthoApnea" :label="t('app.orthoApneaOrder.comments.notifyOrthoApnea')" hide-details density="compact" />
    </div>
    <VAlert v-if="notifyOrthoApnea" type="warning" variant="tonal" density="comfortable" class="mb-2">
      {{ t("app.orthoApneaOrder.comments.notifyWarning") }}
    </VAlert>
    <AppButton color="primary" class="oa-comments__submit" :loading="addLoading" :disabled="!draft.trim()" @click="onAdd">
      {{ t("app.notes.add") }}
    </AppButton>

    <AppLoadingState v-if="loading && !loaded" />
    <AppErrorState
      v-else-if="loadError"
      :title="t('app.errorState.title')"
      :subtitle="t('app.notes.errorLoad')"
      :refresh-label="t('app.errorState.refresh')"
      :loading="loading"
      @refresh="loadNotes"
    />
    <AppEmptyState v-else-if="notes.length === 0" :title="t('app.notes.empty')" />
    <ul v-else class="oa-comments__list">
      <li v-for="note in notes" :key="note.id" class="oa-comments__item">
        <div class="oa-comments__item-header">
          <EntityLink class="oa-comments__author" :to="userDetailLink(authStore.user?.role, note.author_id)" :label="note.author_name" />
          <span class="oa-comments__date">{{ new Date(note.created_at).toLocaleString() }}</span>
        </div>
        <p class="oa-comments__body">{{ note.body }}</p>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import AppButton from "../AppButton.vue";
import AppLoadingState from "../AppLoadingState.vue";
import AppErrorState from "../AppErrorState.vue";
import AppEmptyState from "../AppEmptyState.vue";
import { apiFetch } from "../../composables/useApi";
import { useNotifications } from "../../composables/useNotifications";
import { useAsyncAction } from "../../composables/useAsyncAction";
import { useNotes } from "../../composables/useNotes";
import { useAuthStore } from "../../stores/auth";
import EntityLink from "../EntityLink.vue";
import { userDetailLink } from "../../utils/entityLinks";

/**
 * Comments on an OrthoApnea order — same underlying `note` table as
 * PatientNotesPanel (entity_type: 'treatment_plan'), but adds one thing that
 * component intentionally doesn't have: an OPT-IN "also notify OrthoApnea"
 * checkbox, UNCHECKED by default. Checking it calls
 * POST .../treatments/:id/comments with notifyOrthoApnea: true, which sends
 * a REAL EMAIL to OrthoApnea's technical team (confirmed via live capture,
 * response `emailed: true`) — never wired as an automatic side effect of
 * just saving a local note, per that risk. Only works once the order has
 * actually been submitted (backend rejects otherwise — nothing to comment
 * on OrthoApnea's side before that).
 */
const props = defineProps<{ treatmentPlanId: string }>();

const { t } = useI18n();
const notifications = useNotifications();
const authStore = useAuthStore();
const { notes, loading, loaded, loadError, loadNotes } = useNotes("treatment_plan", () => props.treatmentPlanId);

const draft = ref("");
const notifyOrthoApnea = ref(false);

const { loading: addLoading, run: onAdd } = useAsyncAction(async () => {
  const text = draft.value.trim();
  if (!text) return;
  try {
    const res = await apiFetch(`/api/v1/partners/orthoapnea/treatments/${props.treatmentPlanId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: text, notifyOrthoApnea: notifyOrthoApnea.value }),
      handleErrors: false,
    });
    if (res.ok) {
      notifications.show(t("app.notes.addSuccess"), "success");
      draft.value = "";
      notifyOrthoApnea.value = false;
      await loadNotes();
      return;
    }
  } catch {
    // fall through to the error toast below
  }
  notifications.show(t("app.notes.errorSave"), "error");
});
</script>

<style scoped>
.oa-comments__notify {
  margin-top: 4px;
}

.oa-comments__submit {
  margin: 8px 0 20px;
}

.oa-comments__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.oa-comments__item {
  padding: 10px 14px;
  border-radius: var(--pwa-radius);
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.oa-comments__item-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.oa-comments__author {
  font-weight: 600;
  font-size: 0.8125rem;
}

.oa-comments__date {
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.oa-comments__body {
  margin: 0;
  white-space: pre-wrap;
  font-size: 0.875rem;
}
</style>
