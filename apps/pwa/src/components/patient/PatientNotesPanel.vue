<template>
  <div class="patient-notes-panel">
    <NoteComposer
      v-model="draft"
      class="patient-notes-panel__compose"
      :placeholder="t('app.notes.placeholder')"
      :loading="addLoading"
      @submit="onAdd"
    />

    <AppLoadingState v-if="loading && !loaded" />
    <AppErrorState
      v-else-if="loadError"
      :error="loadFailure"
      :subtitle="t('app.notes.errorLoad')"
      :refresh-label="t('app.errorState.refresh')"
      :loading="loading"
      @refresh="loadNotes"
    />
    <!-- NEO-153: a quiet one-liner, not the full-page empty state — the compose
         box right above it is the call to action. -->
    <p v-else-if="notes.length === 0" class="patient-notes-panel__empty">{{ t("app.notes.empty") }}</p>
    <ul v-else class="patient-notes-panel__list">
      <li v-for="note in notes" :key="note.id" class="patient-notes-panel__item">
        <div class="patient-notes-panel__item-header">
          <EntityLink class="patient-notes-panel__author" :to="userDetailLink(authStore.user?.role, note.author_id)" :label="note.author_name" />
          <span class="patient-notes-panel__date">{{ new Date(note.created_at).toLocaleString() }}</span>
          <AppButton
            v-if="canDelete(note)"
            icon
            variant="text"
            size="small"
            :aria-label="t('app.common.remove')"
            @click="askDelete(note.id)"
          >
            <AppIcon name="trash" />
          </AppButton>
        </div>
        <p class="patient-notes-panel__body">{{ note.body }}</p>
      </li>
    </ul>

    <AppConfirmDialog
      v-model="showDeleteConfirm"
      :text="t('app.notes.deleteConfirmText')"
      :secondary-label="t('app.common.cancel')"
      :secondary-color="null"
      :primary-label="t('app.common.remove')"
      primary-color="error"
      primary-variant="text"
      :loading="deleteLoading"
      :persistent="false"
      max-width="360"
      @secondary="showDeleteConfirm = false"
      @primary="onConfirmDelete"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from "vue";
import { useI18n } from "vue-i18n";
import AppButton from "../AppButton.vue";
import AppConfirmDialog from "../AppConfirmDialog.vue";
import AppIcon from "../AppIcon.vue";
import AppLoadingState from "../AppLoadingState.vue";
import AppErrorState from "../AppErrorState.vue";
import NoteComposer from "../NoteComposer.vue";
import { useAuthStore } from "../../stores/auth";
import { useAsyncAction } from "../../composables/useAsyncAction";
import { useNotes, type NoteItem } from "../../composables/useNotes";
import EntityLink from "../EntityLink.vue";
import { userDetailLink } from "../../utils/entityLinks";

/**
 * Generic — entity-type/entity-id props (not patient-specific) so this panel
 * can be reused verbatim for practitioner/organization/lead notes later.
 */
const props = defineProps<{
  entityType: string;
  entityId: string;
}>();

const { t } = useI18n();
const authStore = useAuthStore();

const { notes, loading, loaded, loadError, loadFailure, loadNotes, addNote, deleteNote } = useNotes(
  props.entityType,
  () => props.entityId
);

const draft = ref("");
const { loading: addLoading, run: onAdd } = useAsyncAction(async () => {
  const ok = await addNote(draft.value);
  if (ok) draft.value = "";
});

const showDeleteConfirm = ref(false);
const pendingDeleteId = ref<string | null>(null);

function askDelete(noteId: string) {
  pendingDeleteId.value = noteId;
  showDeleteConfirm.value = true;
}

const { loading: deleteLoading, run: onConfirmDelete } = useAsyncAction(async () => {
  if (!pendingDeleteId.value) return;
  const ok = await deleteNote(pendingDeleteId.value);
  if (ok) {
    showDeleteConfirm.value = false;
    pendingDeleteId.value = null;
  }
});

function canDelete(note: NoteItem): boolean {
  return note.author_id === authStore.user?.id || authStore.user?.role === "admin";
}

onMounted(loadNotes);
watch(
  () => props.entityId,
  () => loadNotes()
);
</script>

<style scoped>
.patient-notes-panel__compose {
  margin-bottom: var(--space-6, 24px);
}

.patient-notes-panel__empty {
  margin: 0;
  font-size: 0.875rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.patient-notes-panel__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.patient-notes-panel__item {
  padding: 12px 16px;
  border-radius: var(--pwa-radius);
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.patient-notes-panel__item-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.patient-notes-panel__author {
  font-weight: 600;
  font-size: 0.875rem;
}

.patient-notes-panel__date {
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  margin-right: auto;
}

.patient-notes-panel__body {
  margin: 0;
  white-space: pre-wrap;
  font-size: 0.9375rem;
}
</style>
