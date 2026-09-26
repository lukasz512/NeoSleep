<template>
  <ItemDetailLayout
    :has-content="hasContent"
    :loading="loading"
    :load-error="loadError"
    :load-error-cause="loadFailure"
    :back-route="{ name: 'document-content' }"
    :back-label="t('user.document-content.editor.back')"
    :record-title="documentLabel"
    :not-found-label="t('user.document-content.editor.notFound')"
    @retry="load"
  >
    <template #body>
      <DetailViewTabs v-model="activeTab" :tabs="editorTabs">
        <template #editor>
          <div class="doc-editor">
            <p class="doc-editor__meta">
              {{ localeLabel }}
              <template v-if="currentVersionNumber !== null">
                · {{ t("user.document-content.editor.currentVersion", { version: currentVersionNumber }) }}
              </template>
            </p>

            <p v-if="currentVersionNumber === null" class="doc-editor__no-content-hint">
              {{ t("user.document-content.editor.noContentYet") }}
            </p>

            <!-- NEO-51: partner agreement / DPA carry a NeoSleep signatory's
                 signature — only on a version that signatory approved. -->
            <AppInlineAlert
              v-if="approval?.countersigned && currentVersionNumber !== null"
              :type="!approval.signatoryName ? 'error' : isCurrentApproved ? 'success' : 'warning'"
              class="doc-editor__approval"
            >
              <template v-if="!approval.signatoryName">{{ t("user.document-content.approval.noSignatory") }}</template>
              <template v-else-if="isCurrentApproved">
                {{ t("user.document-content.approval.approved", { version: currentVersionNumber, name: approval.signatoryName }) }}
              </template>
              <template v-else>
                {{ t("user.document-content.approval.pending", { version: currentVersionNumber, name: approval.signatoryName }) }}
              </template>
              <template v-if="approval.canApprove && !isCurrentApproved" #append>
                <AppButton color="primary" variant="flat" size="small" :loading="approving" @click="onApprove">
                  {{ t("user.document-content.approval.approve") }}
                </AppButton>
              </template>
            </AppInlineAlert>

            <div class="doc-editor__layout">
              <div class="doc-editor__main">
                <p class="doc-editor__token-hint">{{ t("user.document-content.editor.protectedTokenHint") }}</p>

                <div class="doc-editor__toolbar">
                  <button
                    type="button"
                    class="doc-editor__toolbar-btn"
                    :class="{ 'doc-editor__toolbar-btn--active': editor?.isActive('bold') }"
                    :aria-label="t('user.document-content.editor.toolbar.bold')"
                    @click="editor?.chain().focus().toggleBold().run()"
                  >
                    <strong>B</strong>
                  </button>
                  <button
                    type="button"
                    class="doc-editor__toolbar-btn"
                    :class="{ 'doc-editor__toolbar-btn--active': editor?.isActive('italic') }"
                    :aria-label="t('user.document-content.editor.toolbar.italic')"
                    @click="editor?.chain().focus().toggleItalic().run()"
                  >
                    <em>I</em>
                  </button>
                  <button
                    type="button"
                    class="doc-editor__toolbar-btn"
                    :class="{ 'doc-editor__toolbar-btn--active': editor?.isActive('underline') }"
                    :aria-label="t('user.document-content.editor.toolbar.underline')"
                    @click="editor?.chain().focus().toggleUnderline().run()"
                  >
                    <u>U</u>
                  </button>
                  <button
                    type="button"
                    class="doc-editor__toolbar-btn"
                    :class="{ 'doc-editor__toolbar-btn--active': editor?.isActive('bulletList') }"
                    :aria-label="t('user.document-content.editor.toolbar.bulletList')"
                    @click="editor?.chain().focus().toggleBulletList().run()"
                  >
                    •≡
                  </button>
                </div>

                <EditorContent :editor="editor" class="doc-editor__content" />

                <VTextField
                  v-model="changeNote"
                  :label="t('user.document-content.editor.changeNoteLabel')"
                  :placeholder="t('user.document-content.editor.changeNotePlaceholder')"
                  variant="outlined"
                  density="comfortable"
                  class="doc-editor__change-note"
                />

                <AppButton color="primary" :loading="saving" @click="onSave">
                  {{ t("user.document-content.editor.save") }}
                </AppButton>
              </div>

              <aside class="doc-editor__history">
                <h2 class="doc-editor__history-title">{{ t("user.document-content.editor.history.title") }}</h2>
                <ul v-if="history.length > 0" class="doc-editor__history-list">
                  <li v-for="v in history" :key="v.id" class="doc-editor__history-item">
                    <span class="doc-editor__history-version">
                      v{{ v.version_number }}
                      <span v-if="v.is_current" class="doc-editor__history-badge">{{ t("user.document-content.editor.history.current") }}</span>
                      <span v-if="approval?.approvedVersionId === v.id" class="doc-editor__history-badge doc-editor__history-badge--approved">
                        {{ t("user.document-content.editor.history.approved") }}
                      </span>
                    </span>
                    <span class="doc-editor__history-by">{{ t("user.document-content.editor.history.by", { name: v.created_by_name }) }}</span>
                    <span class="doc-editor__history-date">{{ formatDate(v.created_at) }}</span>
                    <span v-if="v.change_note" class="doc-editor__history-note">{{ v.change_note }}</span>
                  </li>
                </ul>
                <p v-else class="doc-editor__history-empty">{{ t("user.document-content.editor.history.empty") }}</p>
              </aside>
            </div>
          </div>
        </template>

        <template #permissions>
          <div class="doc-editor__permissions">
            <p class="doc-editor__permissions-hint">{{ t("user.document-content.permissions.hint") }}</p>
            <VAutocomplete
              v-model="selectedEntityTypes"
              :items="entityTypeOptions"
              item-title="title"
              item-value="value"
              :label="t('user.document-content.permissions.label')"
              multiple
              chips
              closable-chips
              variant="outlined"
              density="comfortable"
              class="doc-editor__permissions-field"
            />
            <!-- Patient Estudios checklist (ADR-024): who fills this document and where it sits. -->
            <fieldset v-if="selectedEntityTypes.includes('patient')" class="doc-editor__checklist">
              <legend class="doc-editor__checklist-title">{{ t("user.document-content.permissions.checklist.title") }}</legend>
              <p class="doc-editor__permissions-hint">{{ t("user.document-content.permissions.checklist.hint") }}</p>
              <div class="doc-editor__checklist-fields">
                <VSelect
                  id="doc-editor-fill-mode"
                  v-model="checklistFillMode"
                  :items="fillModeOptions"
                  item-title="title"
                  item-value="value"
                  :label="t('user.document-content.permissions.checklist.fillMode')"
                  variant="outlined"
                  density="comfortable"
                />
                <VTextField
                  id="doc-editor-sort-order"
                  v-model.number="checklistSortOrder"
                  type="number"
                  min="0"
                  max="999"
                  :label="t('user.document-content.permissions.checklist.sortOrder')"
                  :hint="t('user.document-content.permissions.checklist.sortOrderHint')"
                  persistent-hint
                  variant="outlined"
                  density="comfortable"
                />
              </div>
            </fieldset>
            <AppButton color="primary" :loading="savingPermissions" @click="onSavePermissions">
              {{ t("user.document-content.permissions.save") }}
            </AppButton>
          </div>
        </template>
      </DetailViewTabs>
    </template>
  </ItemDetailLayout>
</template>

<script setup lang="ts">
import { reportCaught, reportFailedResponse } from "@api";
import { ref, computed, onMounted, onBeforeUnmount, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import { useEditor, EditorContent } from "@tiptap/vue-3";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { VTextField, VAutocomplete } from "vuetify/components";
import ItemDetailLayout from "../components/ItemDetailLayout.vue";
import DetailViewTabs, { type DetailViewTab } from "../components/DetailViewTabs.vue";
import AppButton from "../components/AppButton.vue";
import ProtectedToken, { htmlToEditorHtml, editorHtmlToPlainHtml } from "../components/documents/protectedTokenExtension";
import { apiFetch } from "../composables/useApi";
import { useNotifications } from "../composables/useNotifications";
import { documentLabelKey } from "../utils/documentLabels";
import { AppInlineAlert } from "@ui";

interface DocumentContentVersion {
  id: string;
  template_key: string;
  locale: string;
  content_html: string;
  version_number: number;
  is_current: boolean;
  created_by_name: string;
  created_at: string;
  change_note: string | null;
}

const { t, locale: appLocale } = useI18n();
const route = useRoute();
const router = useRouter();
const notifications = useNotifications();

const templateKey = computed(() => route.params.templateKey as string);
const documentLocale = computed(() => route.params.locale as string);

const loading = ref(true);
const loadError = ref(false);
/** The error behind loadError (NEO-81) — lets the error state say offline vs. server problem. */
const loadFailure = ref<unknown>(null);
const hasContent = ref(false);
const currentVersionNumber = ref<number | null>(null);
const currentVersionId = ref<string | null>(null);
const history = ref<DocumentContentVersion[]>([]);

/** GET .../approval — `countersigned: false` for every template the NeoSleep signatory doesn't sign. */
interface ApprovalStatus {
  countersigned: boolean;
  signatoryName?: string | null;
  canApprove?: boolean;
  approvedVersionId?: string | null;
}
const approval = ref<ApprovalStatus | null>(null);
const approving = ref(false);
const isCurrentApproved = computed(
  () => !!currentVersionId.value && approval.value?.approvedVersionId === currentVersionId.value
);
const changeNote = ref("");
const saving = ref(false);

const editorTabs: DetailViewTab[] = [
  { value: "editor", labelKey: "user.document-content.tabs.editor" },
  { value: "permissions", labelKey: "user.document-content.tabs.permissions" },
];
const activeTab = ref((route.query.tab as string) || "editor");
watch(activeTab, (tab) => {
  router.replace({ query: { ...route.query, tab } });
});

const ENTITY_TYPES = ["lead", "patient", "practitioner", "organization"] as const;
const entityTypeOptions = computed(() =>
  ENTITY_TYPES.map((value) => ({ value, title: t(`user.document-content.permissions.entityTypes.${value}`) }))
);
const selectedEntityTypes = ref<string[]>([]);
const savingPermissions = ref(false);

const editor = useEditor({
  extensions: [StarterKit, Underline, ProtectedToken],
  content: "",
});

const documentLabel = computed(() => {
  const key = documentLabelKey(templateKey.value);
  const translated = key ? t(key) : "";
  return translated && translated !== key ? translated : templateKey.value;
});

const localeLabel = computed(() => {
  const key = `user.document-content.locale.${documentLocale.value}`;
  const translated = t(key);
  return translated === key ? documentLocale.value.toUpperCase() : translated;
});

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(appLocale.value, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

async function loadHistory(): Promise<void> {
  const res = await apiFetch(`/api/v1/document-content/${templateKey.value}/${documentLocale.value}/versions`, {
    handleErrors: false,
  });
  if (res.ok) history.value = (await res.json()) as DocumentContentVersion[];
}

async function loadApproval(): Promise<void> {
  const res = await apiFetch(`/api/v1/document-content/${templateKey.value}/${documentLocale.value}/approval`, {
    handleErrors: false,
  });
  approval.value = res.ok ? ((await res.json()) as ApprovalStatus) : null;
}

async function onApprove(): Promise<void> {
  if (!currentVersionId.value || approving.value) return;
  approving.value = true;
  try {
    const res = await apiFetch(
      `/api/v1/document-content/${templateKey.value}/${documentLocale.value}/versions/${currentVersionId.value}/approve`,
      { method: "POST", handleErrors: false },
    );
    if (res.ok) {
      notifications.show(t("user.document-content.approval.approveSuccess"), "success", undefined, { icon: "nav-document-content" });
      await loadApproval();
    } else {
      notifications.show(t("user.document-content.approval.approveError"), "error", undefined, { icon: "nav-document-content" });
    }
  } catch (err) {
    reportCaught(err, { where: "DocumentContentEditorView.onApprove" });
    notifications.show(t("user.document-content.approval.approveError"), "error", undefined, { icon: "nav-document-content" });
  } finally {
    approving.value = false;
  }
}

/** Entity-type assignment is keyed by templateKey alone (not templateKey+locale — see ADR-021: assignment is a template-level property). */
async function loadEntityTypes(): Promise<void> {
  const res = await apiFetch(`/api/v1/document-content/${templateKey.value}/entity-types`, { handleErrors: false });
  if (res.ok) selectedEntityTypes.value = (await res.json()) as string[];
  await loadChecklistConfig();
}

// Patient Estudios checklist config — only when the template is assigned to patients.
const FILL_MODES = ["consent", "patient", "doctor", "external"] as const;
const fillModeOptions = computed(() =>
  FILL_MODES.map((value) => ({ value, title: t(`user.document-content.permissions.checklist.fillModes.${value}`) }))
);
const checklistFillMode = ref<string | null>(null);
const checklistSortOrder = ref<number | null>(null);

async function loadChecklistConfig(): Promise<void> {
  checklistFillMode.value = null;
  checklistSortOrder.value = null;
  if (!selectedEntityTypes.value.includes("patient")) return;
  const res = await apiFetch(`/api/v1/document-content/${templateKey.value}/patient-checklist`, { handleErrors: false });
  if (!res.ok) return;
  const config = (await res.json()) as { fillMode: string | null; sortOrder: number | null } | null;
  checklistFillMode.value = config?.fillMode ?? null;
  checklistSortOrder.value = config?.sortOrder ?? null;
}

async function saveChecklistConfig(): Promise<boolean> {
  if (!selectedEntityTypes.value.includes("patient") || !checklistFillMode.value || checklistSortOrder.value == null) return true;
  const res = await apiFetch(`/api/v1/document-content/${templateKey.value}/patient-checklist`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fillMode: checklistFillMode.value, sortOrder: checklistSortOrder.value }),
  });
  return res.ok;
}

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = false;
  loadFailure.value = null;
  hasContent.value = false;
  try {
    const res = await apiFetch(`/api/v1/document-content/${templateKey.value}/${documentLocale.value}`, {
      handleErrors: false,
    });
    if (res.ok) {
      const version = (await res.json()) as DocumentContentVersion;
      currentVersionNumber.value = version.version_number;
      currentVersionId.value = version.id;
      editor.value?.commands.setContent(htmlToEditorHtml(version.content_html));
      hasContent.value = true;
    } else if (res.status === 404) {
      // No saved content yet — not an error state: the admin can still
      // open the editor and write the first version (see the plan's
      // "missing-content fails loudly at render/generation time, not
      // here" — the editor itself must stay usable for a template that
      // has never been saved to).
      currentVersionNumber.value = null;
      editor.value?.commands.setContent("");
      hasContent.value = true;
    } else {
      loadFailure.value = await reportFailedResponse(res, { where: "DocumentContentEditorView.load" });
      loadError.value = true;
    }
    await loadHistory();
    await loadEntityTypes();
    await loadApproval();
  } catch (err) {
    reportCaught(err, { where: "DocumentContentEditorView.load" });
    loadFailure.value = err;
    loadError.value = true;
  } finally {
    loading.value = false;
  }
}

onMounted(load);
onBeforeUnmount(() => editor.value?.destroy());

async function onSave(): Promise<void> {
  if (!editor.value || saving.value) return;
  saving.value = true;
  try {
    const contentHtml = editorHtmlToPlainHtml(editor.value.getHTML());
    const res = await apiFetch(`/api/v1/document-content/${templateKey.value}/${documentLocale.value}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentHtml, changeNote: changeNote.value || null }),
      handleErrors: false, // own error toast below — one failure, one toast
    });
    if (res.ok) {
      const version = (await res.json()) as DocumentContentVersion;
      currentVersionNumber.value = version.version_number;
      currentVersionId.value = version.id;
      changeNote.value = "";
      notifications.show(t("user.document-content.editor.saveSuccess"), "success", undefined, { icon: "nav-document-content" });
      await loadHistory();
      // A new version is never approved — the banner must flip to "pending".
      await loadApproval();
    } else {
      notifications.show(t("user.document-content.editor.saveError"), "error", undefined, { icon: "nav-document-content" });
    }
  } catch (err) {
    reportCaught(err, { where: "DocumentContentEditorView.onSave" });
    notifications.show(t("user.document-content.editor.saveError"), "error", undefined, { icon: "nav-document-content" });
  } finally {
    saving.value = false;
  }
}

async function onSavePermissions(): Promise<void> {
  if (savingPermissions.value) return;
  savingPermissions.value = true;
  try {
    const res = await apiFetch(`/api/v1/document-content/${templateKey.value}/entity-types`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entityTypes: selectedEntityTypes.value }),
      handleErrors: false,
    });
    if (res.ok && (await saveChecklistConfig())) {
      selectedEntityTypes.value = (await res.json()) as string[];
      notifications.show(t("user.document-content.permissions.saveSuccess"), "success", undefined, { icon: "nav-document-content" });
    } else {
      notifications.show(t("user.document-content.permissions.saveError"), "error", undefined, { icon: "nav-document-content" });
    }
  } catch (err) {
    reportCaught(err, { where: "DocumentContentEditorView.onSavePermissions" });
    notifications.show(t("user.document-content.permissions.saveError"), "error", undefined, { icon: "nav-document-content" });
  } finally {
    savingPermissions.value = false;
  }
}
</script>

<style scoped>
.view-item__title-wrap {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}


.doc-editor__meta {
  margin: 0 0 8px;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.875rem;
}

.doc-editor__no-content-hint {
  margin: 0 0 16px;
  padding: 10px 14px;
  border-radius: 8px;
  background: rgba(var(--v-theme-warning), 0.1);
  color: rgb(var(--v-theme-warning));
  font-size: 0.875rem;
}

.doc-editor__layout {
  display: grid;
  grid-template-columns: 1fr;
  gap: 24px;
}
@media (min-width: 900px) {
  .doc-editor__layout {
    grid-template-columns: 1fr 280px;
    align-items: start;
  }
}

.doc-editor__token-hint {
  margin: 0 0 10px;
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.doc-editor__toolbar {
  display: flex;
  gap: 4px;
  margin-bottom: 8px;
}

.doc-editor__toolbar-btn {
  min-width: 36px;
  min-height: 36px;
  border-radius: 6px;
  border: 1px solid rgb(var(--v-theme-outline-variant));
  background: transparent;
  cursor: pointer;
}
.doc-editor__toolbar-btn--active {
  background: rgba(var(--v-theme-primary), 0.12);
  border-color: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-primary));
}

.doc-editor__content {
  border: 1px solid rgb(var(--v-theme-outline-variant));
  border-radius: 8px;
  padding: 16px;
  min-height: 320px;
  margin-bottom: 16px;
}
.doc-editor__content :deep(.tiptap) {
  outline: none;
  min-height: 288px;
}
.doc-editor__content :deep(p) {
  margin: 0 0 10px;
}
/* Protected {name}-style token — bold + distinct color, per Łukasz's own
   proposed solution, and un-editable character-by-character (atom node). */
.doc-editor__content :deep(span[data-protected-token]) {
  font-weight: 700;
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.1);
  border-radius: 4px;
  padding: 1px 4px;
}

.doc-editor__change-note {
  max-width: 420px;
  margin-bottom: 12px;
}

.doc-editor__history {
  border: 1px solid rgb(var(--v-theme-outline-variant));
  border-radius: 8px;
  padding: 16px;
}

.doc-editor__history-title {
  font-size: 0.9375rem;
  font-weight: 600;
  margin: 0 0 12px;
}

.doc-editor__history-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.doc-editor__history-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 0.8125rem;
}

.doc-editor__history-version {
  font-weight: 600;
}

.doc-editor__history-badge {
  display: inline-flex;
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 0.6875rem;
  font-weight: 500;
  background: rgba(var(--v-theme-success), 0.12);
  color: rgb(var(--v-theme-success));
}

.doc-editor__history-badge--approved {
  background: rgba(var(--v-theme-primary), 0.12);
  color: rgb(var(--v-theme-primary));
}

.doc-editor__approval {
  margin: 0 0 16px;
}

.doc-editor__approval :deep(.v-btn) {
  text-transform: none;
  letter-spacing: normal;
}

.doc-editor__history-by,
.doc-editor__history-date {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.doc-editor__history-note {
  margin-top: 2px;
  font-style: italic;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.doc-editor__history-empty {
  margin: 0;
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.doc-editor__checklist {
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: var(--pwa-radius);
  padding: 12px 16px 16px;
  margin: 0 0 16px;
  max-width: 560px;
}
.doc-editor__checklist-title {
  padding: 0 6px;
  font-weight: 600;
}
.doc-editor__checklist-fields {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 12px;
}
@media (max-width: 600px) {
  .doc-editor__checklist-fields {
    grid-template-columns: 1fr;
  }
}
.doc-editor__permissions {
  max-width: 480px;
}

.doc-editor__permissions-hint {
  margin: 0 0 16px;
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.doc-editor__permissions-field {
  margin-bottom: 12px;
}
</style>
