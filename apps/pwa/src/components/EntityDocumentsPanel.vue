<template>
  <AppLoadingState v-if="loading" />
  <p v-else-if="documents.length === 0" class="entity-documents__empty">
    {{ t("user.entityDocuments.empty") }}
  </p>
  <ul v-else class="entity-documents__list">
    <li v-for="doc in documents" :key="doc.id" class="entity-documents__item">
      <span class="entity-documents__type">{{ documentTypeLabel(doc) }}</span>
      <span class="entity-documents__date">
        {{ t("user.entityDocuments.signedAt") }} {{ new Date(doc.signedAt).toLocaleDateString() }}
      </span>
      <AppButton variant="text" size="small" @click="onDownload(doc.id)">
        {{ t("user.entityDocuments.download") }}
      </AppButton>
    </li>
  </ul>
</template>

<script setup lang="ts">
/**
 * Entity-agnostic "Documents" tab panel — one file instead of duplicating
 * UserDetailView.vue's inline fetch/list/download logic on HCP/HCO/Patient
 * detail views. Fetches in its own onMounted, which — because it's a
 * separate component mounted inside DetailViewTabs' non-eager VWindowItem
 * (see DetailViewTabs.vue's own doc comment) — only actually runs the first
 * time this tab is switched to, not on page load.
 */
import { ref, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import AppButton from "./AppButton.vue";
import AppLoadingState from "./AppLoadingState.vue";
import { apiFetch } from "../composables/useApi";
import { retryAction, useNotifications } from "../composables/useNotifications";

interface EntityDocument {
  id: string;
  documentType: string | null;
  filename: string | null;
  mimeType: string | null;
  signedAt: string;
}

const props = defineProps<{
  /** Full path to the entity's documents list endpoint, e.g. `/api/v1/practitioner/${id}/documents`. Download appends `/{documentId}/download`. Naming matches EntityHistoryPanel.vue's own `endpoint` prop. */
  endpoint: string;
}>();

const { t } = useI18n();
const notifications = useNotifications();

const loading = ref(true);
const documents = ref<EntityDocument[]>([]);

/** documentType is an open-ended string (not a fixed enum — see queries/entityDocuments.ts), so a missing i18n key falls back to the raw value rather than showing the key itself. */
function documentTypeLabel(doc: EntityDocument): string {
  if (!doc.documentType) return doc.filename ?? t("user.entityDocuments.type.unknown");
  const key = `user.entityDocuments.type.${doc.documentType}`;
  const translated = t(key);
  return translated !== key ? translated : doc.documentType;
}

function failLoad(): void {
  notifications.show(t("user.entityDocuments.errorLoad"), "error", undefined, { icon: "file", action: retryAction(load) });
}

async function load(): Promise<void> {
  loading.value = true;
  try {
    const res = await apiFetch(props.endpoint, { handleErrors: false });
    if (res.ok) {
      documents.value = (await res.json()) as EntityDocument[];
    } else {
      failLoad();
    }
  } catch {
    failLoad();
  } finally {
    loading.value = false;
  }
}

async function onDownload(documentId: string): Promise<void> {
  const res = await apiFetch(`${props.endpoint}/${documentId}/download`, { handleErrors: false });
  if (res.ok) {
    const { url } = (await res.json()) as { url: string };
    window.open(url, "_blank", "noopener");
  } else {
    notifications.show(t("user.entityDocuments.errorLoad"), "error", undefined, {
      icon: "file",
      action: retryAction(() => onDownload(documentId)),
    });
  }
}

onMounted(load);
</script>

<style scoped>
.entity-documents__empty {
  margin: 0;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.entity-documents__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.entity-documents__item {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid rgb(var(--v-theme-outline-variant));
}

.entity-documents__type {
  font-weight: 600;
}

.entity-documents__date {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.8125rem;
}
</style>
