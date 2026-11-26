<template>
  <div class="view-documents">
    <div class="view-documents__header">
      <h1 class="view-documents__title">{{ t("user.document-content.title") }}</h1>
    </div>

    <AppLoadingState v-if="loading" />
    <AppErrorState
      v-else-if="loadError"
      :error="loadFailure"
      :title="t('user.document-content.errorLoad')"
      :refresh-label="t('app.errorState.refresh')"
      @refresh="load"
    />

    <VTable v-else class="view-documents__table" hover>
      <thead>
        <tr>
          <th>{{ t("user.document-content.table.document") }}</th>
          <th>{{ t("user.document-content.table.locale") }}</th>
          <th>{{ t("user.document-content.table.version") }}</th>
          <th>{{ t("user.document-content.table.updated") }}</th>
          <th>{{ t("user.document-content.table.status") }}</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="doc in documents"
          :key="`${doc.templateKey}/${doc.locale}`"
          class="view-documents__row"
          tabindex="0"
          @click="openEditor(doc)"
          @keydown.enter="openEditor(doc)"
        >
          <td class="view-documents__cell-label">
            <AppIcon name="nav-document-content" class="view-documents__row-icon" />
            {{ documentLabel(doc) }}
          </td>
          <td>{{ localeLabel(doc.locale) }}</td>
          <td>{{ doc.currentVersionNumber ?? "—" }}</td>
          <td>{{ formatDate(doc.updatedAt) }}</td>
          <td>
            <span
              class="view-documents__status"
              :class="doc.hasContent ? 'view-documents__status--published' : 'view-documents__status--empty'"
            >
              {{ t(doc.hasContent ? "user.document-content.status.hasContent" : "user.document-content.status.noContent") }}
            </span>
          </td>
        </tr>
      </tbody>
    </VTable>
  </div>
</template>

<script setup lang="ts">
import { reportCaught, reportFailedResponse } from "@api";
import { ref, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import { VTable } from "vuetify/components";
import AppIcon from "../components/AppIcon.vue";
import AppLoadingState from "../components/AppLoadingState.vue";
import AppErrorState from "../components/AppErrorState.vue";
import { apiFetch } from "../composables/useApi";
import { documentLabelKey } from "../utils/documentLabels";

export interface DocumentContentIndexEntry {
  templateKey: string;
  locale: string;
  label: string;
  hasContent: boolean;
  currentVersionNumber: number | null;
  updatedAt: string | null;
}

const { t, locale: appLocale } = useI18n();
const router = useRouter();

const documents = ref<DocumentContentIndexEntry[]>([]);
const loading = ref(true);
const loadError = ref(false);
/** The error behind loadError (NEO-81) — lets the error state say offline vs. server problem. */
const loadFailure = ref<unknown>(null);

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = false;
  loadFailure.value = null;
  try {
    const res = await apiFetch("/api/v1/document-content", { handleErrors: false });
    if (res.ok) {
      documents.value = (await res.json()) as DocumentContentIndexEntry[];
    } else {
      loadFailure.value = await reportFailedResponse(res, { where: "DocumentsView.load" });
      loadError.value = true;
    }
  } catch (err) {
    reportCaught(err, { where: "DocumentsView.load" });
    loadFailure.value = err;
    loadError.value = true;
  } finally {
    loading.value = false;
  }
}

onMounted(load);

function documentLabel(doc: DocumentContentIndexEntry): string {
  const key = documentLabelKey(doc.templateKey);
  const translated = key ? t(key) : "";
  return translated && translated !== key ? translated : doc.label;
}

function localeLabel(docLocale: string): string {
  const key = `user.document-content.locale.${docLocale}`;
  const translated = t(key);
  return translated === key ? docLocale.toUpperCase() : translated;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(appLocale.value, { year: "numeric", month: "short", day: "numeric" });
}

function openEditor(doc: DocumentContentIndexEntry): void {
  router.push({ name: "document-content-detail", params: { templateKey: doc.templateKey, locale: doc.locale } });
}
</script>

<style scoped>
.view-documents {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.view-documents__header {
  margin-bottom: 16px;
}

.view-documents__title {
  font-size: 1.375rem;
  font-weight: 600;
  margin: 0 0 4px;
}

.view-documents__table {
  background: transparent;
}

.view-documents__row {
  cursor: pointer;
}

.view-documents__cell-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
}

.view-documents__row-icon {
  width: 18px;
  height: 18px;
  color: rgb(var(--v-theme-primary));
  flex-shrink: 0;
}

.view-documents__status {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 500;
}

.view-documents__status--published {
  background: rgba(var(--v-theme-success), 0.12);
  color: rgb(var(--v-theme-success));
}

.view-documents__status--empty {
  background: rgba(var(--v-theme-on-surface), 0.08);
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
</style>
