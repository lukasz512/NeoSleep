<template>
  <div class="patient-aside">
    <section class="patient-aside__card" :aria-label="t('app.patients.detail.aside.keyFacts')">
      <h2 class="patient-aside__heading">{{ t("app.patients.detail.aside.keyFacts") }}</h2>
      <dl class="patient-aside__facts">
        <dt>{{ t("app.patients.detail.status") }}</dt>
        <dd>
          <VChip v-if="patient.status" :color="patientStatusColor(patient.status)" size="small" variant="tonal">
            {{ patientStatusLabel(t, patient.status) }}
          </VChip>
          <span v-else>—</span>
        </dd>
        <dt>{{ t("app.patients.detail.ahiBaseline") }}</dt>
        <dd>{{ patient.ahi_baseline ?? "—" }}</dd>
        <dt>{{ t("app.patients.detail.cpapDevice") }}</dt>
        <dd>{{ patient.cpap_device ? t("app.common.yes") : t("app.common.no") }}</dd>
        <dt>{{ t("app.patients.detail.practitioner") }}</dt>
        <dd>
          <RouterLink
            v-if="patient.practitioner_id && patient.practitioner_name"
            class="patient-aside__link"
            :to="{ name: 'hcp-detail', params: { id: patient.practitioner_id } }"
          >
            {{ patient.practitioner_name }}
          </RouterLink>
          <span v-else>{{ patient.practitioner_name || "—" }}</span>
        </dd>
      </dl>
    </section>

    <section class="patient-aside__card" :aria-label="t('app.patients.detail.aside.recentNotes')">
      <h2 class="patient-aside__heading">{{ t("app.patients.detail.aside.recentNotes") }}</h2>
      <NoteComposer
        v-model="draft"
        :placeholder="t('app.patients.detail.aside.quickNote')"
        :loading="addLoading"
        :rows="1"
        @submit="onAdd"
      />
      <p v-if="loadError" class="patient-aside__muted">{{ t("app.notes.errorLoad") }}</p>
      <p v-else-if="loaded && notes.length === 0" class="patient-aside__muted">{{ t("app.notes.empty") }}</p>
      <ul v-else-if="recent.length" class="patient-aside__notes">
        <li v-for="note in recent" :key="note.id" class="patient-aside__note">
          <div class="patient-aside__note-meta">
            <span class="patient-aside__note-author">{{ note.author_name }}</span>
            <span>{{ formatDate(note.created_at) }}</span>
          </div>
          <p class="patient-aside__note-body">{{ note.body }}</p>
        </li>
      </ul>
      <button v-if="notes.length > 0" type="button" class="patient-aside__all" @click="$emit('open-notes')">
        {{ t("app.patients.detail.aside.allNotes", { count: notes.length }) }}
      </button>
    </section>
  </div>
</template>

<script setup lang="ts">
/**
 * NEO-153 desktop side panel for PatientDetailView (ItemDetailLayout #aside):
 * key facts plus the latest notes with a quick-add box, so a rep can jot a
 * note without leaving the tab they are on. Desktop only — ItemDetailLayout
 * does not mount it on tablets or phones, where the Details and Notes tabs
 * carry the same content. A note added here reloads an open Notes tab (and
 * vice versa) through useNotes' change event.
 */
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { VChip } from "vuetify/components";
import NoteComposer from "../NoteComposer.vue";
import { useNotes } from "../../composables/useNotes";
import { useAsyncAction } from "../../composables/useAsyncAction";
import { patientStatusColor, patientStatusLabel } from "../../utils/patientStatus";

const RECENT_NOTES = 3;

const props = defineProps<{
  patient: {
    id: string;
    status?: string;
    ahi_baseline?: number | null;
    cpap_device?: string | null;
    practitioner_id?: string | null;
    practitioner_name?: string | null;
  };
}>();

defineEmits<{
  "open-notes": [];
}>();

const { t, locale } = useI18n();

const { notes, loaded, loadError, loadNotes, addNote } = useNotes("patient", () => props.patient.id);
const recent = computed(() => notes.value.slice(0, RECENT_NOTES));

const draft = ref("");
const { loading: addLoading, run: onAdd } = useAsyncAction(async () => {
  const ok = await addNote(draft.value);
  if (ok) draft.value = "";
});

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(locale.value, { day: "numeric", month: "short" });
}

onMounted(loadNotes);
watch(
  () => props.patient.id,
  () => loadNotes(),
);
</script>

<style scoped>
.patient-aside {
  display: flex;
  flex-direction: column;
  gap: var(--space-4, 16px);
}

.patient-aside__card {
  display: flex;
  flex-direction: column;
  gap: var(--space-3, 12px);
  padding: var(--space-4, 16px);
  border-radius: var(--pwa-radius, 12px);
  background: rgba(var(--v-theme-on-surface), 0.04);
}

.patient-aside__heading {
  margin: 0;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.patient-aside__facts {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--space-2, 8px) var(--space-3, 12px);
  align-items: center;
  margin: 0;
  font-size: 0.875rem;
}

.patient-aside__facts dt {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.patient-aside__facts dd {
  margin: 0;
  text-align: right;
}

.patient-aside__link,
.patient-aside__all {
  color: rgb(var(--v-theme-primary));
  text-decoration: none;
}

.patient-aside__notes {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.patient-aside__note {
  padding: var(--space-2, 8px) 0;
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.patient-aside__note:first-child {
  border-top: none;
}

.patient-aside__note-meta {
  display: flex;
  gap: var(--space-2, 8px);
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.patient-aside__note-author {
  font-weight: 600;
  color: rgb(var(--v-theme-primary));
}

.patient-aside__note-body {
  margin: 2px 0 0;
  font-size: 0.875rem;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  white-space: pre-wrap;
}

.patient-aside__muted {
  margin: 0;
  font-size: 0.875rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.patient-aside__all {
  align-self: flex-start;
  padding: 0;
  border: none;
  background: none;
  font: inherit;
  font-size: 0.8125rem;
  cursor: pointer;
}

.patient-aside__all:focus-visible,
.patient-aside__link:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
  border-radius: 4px;
}
</style>
