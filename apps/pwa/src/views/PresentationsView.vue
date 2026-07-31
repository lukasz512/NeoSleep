<template>
  <div class="view-presentations app-entity-list">
    <div v-if="!isTrulyEmpty && !loadError && !isInitialLoading" class="app-entity-list__toolbar">
      <div class="app-entity-list__search-group">
        <VTextField
          v-model="searchQuery"
          type="search"
          class="app-entity-list__search"
          :placeholder="t('user.presentations.searchPlaceholder')"
          :aria-label="t('user.presentations.searchPlaceholder')"
          autocomplete="off"
          density="comfortable"
          variant="outlined"
          hide-details
          :clearable="false"
          :loading="loading ? 'primary' : false"
        >
          <template #prepend-inner>
            <AppIcon name="search" class="app-entity-list__search-icon" />
          </template>
          <template #append-inner>
            <VTooltip v-if="searchQuery.trim()" location="bottom">
              <template #activator="{ props: tooltipProps }">
                <AppButton
                  v-bind="tooltipProps"
                  icon
                  variant="flat"
                  size="small"
                  :loading="clearingSearch"
                  class="app-entity-list__search-clear"
                  :aria-label="t('user.presentations.filters.clear')"
                  @click="onSearchClear"
                >
                  <AppIcon name="close" class="app-entity-list__icon" />
                </AppButton>
              </template>
              <span>{{ t("user.presentations.filters.clear") }}</span>
            </VTooltip>
          </template>
        </VTextField>
        <VTooltip v-if="hasActiveFiltersOrSearch" location="bottom">
          <template #activator="{ props: tooltipProps }">
            <AppButton
              v-bind="tooltipProps"
              icon
              variant="flat"
              size="large"
              :loading="clearingFilters"
              class="app-entity-list__clear-filters app-entity-list__clear-filters--no-border"
              :aria-label="t('user.presentations.filters.clear')"
              @click="onFiltersClear"
            >
              <AppIcon name="close" class="app-entity-list__icon" />
            </AppButton>
          </template>
          <span>{{ t("user.presentations.filters.clear") }}</span>
        </VTooltip>
        <AppFilterBar
          :model-value="filterState"
          :definitions="presentationFilterDefinitions"
          title-key="user.presentations.filters.title"
          clear-key="user.presentations.filters.clear"
          :active-filter-count="activeFilterCount"
          @update:model-value="onFilterStateUpdate"
          @clear="onFiltersClear"
        />
      </div>
      <VTooltip v-if="isAdmin" location="bottom">
        <template #activator="{ props: tooltipProps }">
          <AppButton
            v-bind="tooltipProps"
            icon
            variant="flat"
            size="large"
            class="app-entity-list__add app-entity-list__add--no-border"
            :aria-label="t('user.presentations.add')"
            @click="onAdd"
          >
            <AppIcon name="plus" class="app-entity-list__icon" />
          </AppButton>
        </template>
        <span>{{ t("user.presentations.add") }}</span>
      </VTooltip>
    </div>

    <div v-if="loadError" class="app-entity-list__error-wrap">
      <AppErrorState
        :title="t('app.errorState.title')"
        :subtitle="loadError"
        :refresh-label="t('app.errorState.refresh')"
        :loading="loading"
        @refresh="loadData"
      />
    </div>

    <div v-else-if="isInitialLoading" class="view-presentations__loading">
      <AppLoadingState />
    </div>

    <div v-else-if="isTrulyEmpty" class="view-presentations__empty">
      <AppEmptyState
        :title="t('user.presentations.emptyTitle')"
        :subtitle="t('user.presentations.emptySubtitle')"
        :show-add-button="isAdmin"
        :add-label="t('user.presentations.add')"
        @add="onAdd"
      />
    </div>

    <div
      v-else-if="!loading && total === 0 && hasActiveFiltersOrSearch"
      class="app-entity-list__no-results-placeholder"
      role="status"
    >
      <div class="app-entity-list__no-results-icon-wrap" aria-hidden="true">
        <AppIcon name="search" class="app-entity-list__no-results-icon" />
      </div>
      <p class="app-entity-list__no-results-title">{{ t("user.presentations.noResultsForCriteria") }}</p>
      <p class="app-entity-list__no-results-subtitle">{{ t("user.presentations.noResultsForCriteriaSubtitle") }}</p>
      <AppButton variant="outlined" color="primary" :loading="clearingFilters" class="app-entity-list__no-results-clear" @click="onFiltersClear">
        {{ t("user.presentations.filters.clear") }}
      </AppButton>
    </div>

    <template v-else>
      <div class="view-presentations__grid">
        <button
          v-for="p in items"
          :key="idOf(p)"
          type="button"
          class="view-presentations__card"
          @click="openViewer(p)"
        >
          <!-- Cover image / placeholder -->
          <div class="view-presentations__cover">
            <img
              v-if="thumbOf(p)"
              :src="thumbOf(p) ?? undefined"
              :alt="titleOf(p)"
              class="view-presentations__cover-img"
              loading="lazy"
            />
            <div v-else class="view-presentations__cover-placeholder" :class="`cover-variant-${coverVariant(idOf(p))}`">
              <svg class="cover-shapes" viewBox="0 0 400 200" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
                <!-- Variant 0: lungs + bronchial tree -->
                <template v-if="coverVariant(idOf(p)) === 0">
                  <ellipse cx="133" cy="118" rx="78" ry="72" fill="rgba(255,255,255,0.10)" />
                  <ellipse cx="267" cy="118" rx="78" ry="72" fill="rgba(255,255,255,0.10)" />
                  <rect x="193" y="12" width="14" height="52" rx="7" fill="rgba(255,255,255,0.22)" />
                  <path d="M200 62 Q162 74 133 96" stroke="rgba(255,255,255,0.20)" stroke-width="8" fill="none" stroke-linecap="round" />
                  <path d="M200 62 Q238 74 267 96" stroke="rgba(255,255,255,0.20)" stroke-width="8" fill="none" stroke-linecap="round" />
                  <path d="M112 112 Q90 132 102 158" stroke="rgba(255,255,255,0.14)" stroke-width="5" fill="none" stroke-linecap="round" />
                  <path d="M122 138 Q104 158 112 176" stroke="rgba(255,255,255,0.10)" stroke-width="4" fill="none" stroke-linecap="round" />
                  <path d="M288 112 Q310 132 298 158" stroke="rgba(255,255,255,0.14)" stroke-width="5" fill="none" stroke-linecap="round" />
                  <path d="M278 138 Q296 158 288 176" stroke="rgba(255,255,255,0.10)" stroke-width="4" fill="none" stroke-linecap="round" />
                </template>
                <!-- Variant 1: breathing waveform with apnea flat line -->
                <template v-else-if="coverVariant(idOf(p)) === 1">
                  <line x1="0" y1="100" x2="400" y2="100" stroke="rgba(255,255,255,0.08)" stroke-width="1" />
                  <line x1="0" y1="60" x2="400" y2="60" stroke="rgba(255,255,255,0.05)" stroke-width="1" stroke-dasharray="4,4" />
                  <line x1="0" y1="140" x2="400" y2="140" stroke="rgba(255,255,255,0.05)" stroke-width="1" stroke-dasharray="4,4" />
                  <path d="M0,100 C10,100 15,48 28,48 C41,48 46,100 56,100 C66,100 71,48 84,48 C97,48 102,100 112,100 C122,100 127,48 140,48 C153,48 158,100 165,100" stroke="rgba(255,255,255,0.38)" stroke-width="2.5" fill="none" stroke-linecap="round" />
                  <line x1="165" y1="100" x2="235" y2="100" stroke="rgba(255,255,255,0.55)" stroke-width="2.5" stroke-linecap="round" />
                  <rect x="162" y="83" width="76" height="34" rx="3" fill="rgba(255,255,255,0.06)" />
                  <path d="M235,100 C242,100 247,48 260,48 C273,48 278,100 288,100 C298,100 303,48 316,48 C329,48 334,100 344,100 C354,100 359,48 372,48 C385,48 390,100 400,100" stroke="rgba(255,255,255,0.38)" stroke-width="2.5" fill="none" stroke-linecap="round" />
                </template>
                <!-- Variant 2: airway cross-section (throat anatomy) -->
                <template v-else-if="coverVariant(idOf(p)) === 2">
                  <ellipse cx="200" cy="100" rx="108" ry="90" fill="rgba(255,255,255,0.07)" stroke="rgba(255,255,255,0.14)" stroke-width="2" />
                  <ellipse cx="200" cy="100" rx="74" ry="62" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.12)" stroke-width="2" />
                  <ellipse cx="200" cy="100" rx="40" ry="32" fill="rgba(255,255,255,0.16)" stroke="rgba(255,255,255,0.28)" stroke-width="2" />
                  <ellipse cx="143" cy="100" rx="22" ry="28" fill="rgba(255,255,255,0.09)" />
                  <ellipse cx="257" cy="100" rx="22" ry="28" fill="rgba(255,255,255,0.09)" />
                  <line x1="200" y1="80" x2="200" y2="118" stroke="rgba(255,255,255,0.30)" stroke-width="2" stroke-linecap="round" />
                  <path d="M193,87 L200,77 L207,87" stroke="rgba(255,255,255,0.30)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" />
                </template>
                <!-- Variant 3: SpO2 pulse oximetry waveform -->
                <template v-else-if="coverVariant(idOf(p)) === 3">
                  <line x1="0" y1="110" x2="400" y2="110" stroke="rgba(255,255,255,0.08)" stroke-width="1" />
                  <line x1="0" y1="55" x2="400" y2="55" stroke="rgba(255,255,255,0.05)" stroke-width="1" stroke-dasharray="4,4" />
                  <path d="M10,110 L20,110 C22,110 26,58 30,42 C34,58 36,92 40,98 C44,104 47,96 50,100 C53,104 56,110 62,110" stroke="rgba(255,255,255,0.38)" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" />
                  <path d="M75,110 L85,110 C87,110 91,58 95,42 C99,58 101,92 105,98 C109,104 112,96 115,100 C118,104 121,110 127,110" stroke="rgba(255,255,255,0.38)" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" />
                  <path d="M140,110 L150,110 C152,110 156,58 160,42 C164,58 166,92 170,98 C174,104 177,96 180,100 C183,104 186,110 192,110" stroke="rgba(255,255,255,0.38)" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" />
                  <path d="M205,110 L215,110 C217,110 221,58 225,42 C229,58 231,92 235,98 C239,104 242,96 245,100 C248,104 251,110 257,110" stroke="rgba(255,255,255,0.38)" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" />
                  <path d="M270,110 L280,110 C282,110 286,58 290,42 C294,58 296,92 300,98 C304,104 307,96 310,100 C313,104 316,110 322,110" stroke="rgba(255,255,255,0.38)" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" />
                  <path d="M335,110 L345,110 C347,110 351,58 355,42 C359,58 361,92 365,98 C369,104 372,96 375,100 C378,104 381,110 390,110" stroke="rgba(255,255,255,0.38)" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" />
                </template>
                <!-- Variant 4: hypnogram — sleep stage steps with apnea markers -->
                <template v-else>
                  <rect x="0" y="28" width="400" height="18" fill="rgba(255,255,255,0.04)" />
                  <rect x="0" y="55" width="400" height="18" fill="rgba(255,255,255,0.03)" />
                  <rect x="0" y="90" width="400" height="18" fill="rgba(255,255,255,0.025)" />
                  <rect x="0" y="122" width="400" height="18" fill="rgba(255,255,255,0.02)" />
                  <polyline points="0,37 35,37 35,64 85,64 85,99 155,99 155,131 235,131 235,99 275,99 275,64 315,64 315,99 365,99 365,64 400,64" stroke="rgba(255,255,255,0.32)" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" />
                  <circle cx="35" cy="37" r="3" fill="rgba(255,255,255,0.42)" />
                  <circle cx="85" cy="64" r="3" fill="rgba(255,255,255,0.38)" />
                  <circle cx="155" cy="99" r="3" fill="rgba(255,255,255,0.38)" />
                  <circle cx="235" cy="131" r="3" fill="rgba(255,255,255,0.38)" />
                  <circle cx="275" cy="99" r="3" fill="rgba(255,255,255,0.34)" />
                  <circle cx="315" cy="64" r="3" fill="rgba(255,255,255,0.34)" />
                  <circle cx="365" cy="99" r="3" fill="rgba(255,255,255,0.34)" />
                  <line x1="100" y1="105" x2="100" y2="116" stroke="rgba(255,255,255,0.42)" stroke-width="2" stroke-linecap="round" />
                  <line x1="116" y1="105" x2="116" y2="116" stroke="rgba(255,255,255,0.38)" stroke-width="2" stroke-linecap="round" />
                  <line x1="132" y1="105" x2="132" y2="116" stroke="rgba(255,255,255,0.34)" stroke-width="2" stroke-linecap="round" />
                </template>
              </svg>
            </div>
            <span v-if="fileTypeOf(p)" class="view-presentations__cover-badge">{{ fileTypeOf(p).toUpperCase() }}</span>
            <AppButton
              v-if="isAdmin"
              icon
              variant="flat"
              size="small"
              class="view-presentations__edit-btn"
              :aria-label="t('user.presentations.form.editTitle')"
              @click.stop="onEdit(p)"
            >
              <AppIcon name="pencil" class="app-entity-list__icon" />
            </AppButton>
          </div>

          <!-- Card body -->
          <div class="view-presentations__card-body">
            <VIcon class="view-presentations__card-icon" size="18">
              {{ fileTypeOf(p) === "pdf" ? "mdi-file-pdf-box" : "mdi-file-powerpoint-box" }}
            </VIcon>
            <span class="view-presentations__card-title">{{ titleOf(p) }}</span>
          </div>
        </button>
      </div>

      <div v-if="pageCount > 1" class="view-presentations__pagination">
        <VPagination
          v-model="tableOptions.page"
          :length="pageCount"
          :total-visible="7"
          density="comfortable"
          @update:model-value="onOptionsUpdate"
        />
      </div>
    </template>

    <PresentationViewer
      v-if="viewerOpen"
      v-model="viewerOpen"
      :presentation="selectedPresentation"
    />

    <FormRenderer
      v-model="showForm"
      :fields="presentationFormFields"
      :initial-data="editingItem ?? undefined"
      title-key="user.presentations.form.title"
      edit-title-key="user.presentations.form.editTitle"
      submit-label-key="user.presentations.form.submit"
      edit-submit-label-key="user.presentations.form.editSubmit"
      @submit="onSubmit"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, defineAsyncComponent } from "vue";
import { useI18n } from "vue-i18n";
import AppButton from "../components/AppButton.vue";
import AppEmptyState from "../components/AppEmptyState.vue";
import AppErrorState from "../components/AppErrorState.vue";
import AppLoadingState from "../components/AppLoadingState.vue";
import AppIcon from "../components/AppIcon.vue";
import AppFilterBar from "../components/AppFilterBar.vue";
import { useAuthStore } from "../stores/auth";
import { apiFetch } from "../composables/useApi";
import { useNotifications } from "../composables/useNotifications";
import { useEntityList } from "../composables/useEntityList";
import type { FilterDefinition } from "../composables/useFilters";
import { presentationFormFields } from "../config/forms/presentationForm";

const PresentationViewer = defineAsyncComponent(() => import("../components/PresentationViewer.vue"));
const FormRenderer = defineAsyncComponent(() => import("../components/FormRenderer.vue"));

interface PresentationViewerItem {
  id: string;
  title: string;
  url: string;
  file_type: string;
}

const { t } = useI18n();
const authStore = useAuthStore();
const notifications = useNotifications();
const isAdmin = computed(() => authStore.user?.role === "admin");

const viewerOpen = ref(false);
const selectedPresentation = ref<PresentationViewerItem | null>(null);
const showForm = ref(false);
const editingItem = ref<Record<string, unknown> | null>(null);

const presentationFilterDefs: FilterDefinition[] = [
  { key: "status", labelKey: "user.presentations.filters.status", type: "select", default: "" },
  { key: "locale", labelKey: "user.presentations.filters.locale", type: "select", default: "" },
];

const statusFilterOptions = computed(() => [
  { title: t("user.presentations.filters.all"), value: "" },
  { title: t("user.presentations.filters.statusActive"), value: "active" },
  { title: t("user.presentations.filters.statusArchived"), value: "archived" },
  { title: t("user.presentations.filters.statusDraft"), value: "draft" },
]);
const localeFilterOptions = computed(() => [
  { title: t("user.presentations.filters.all"), value: "" },
  { title: t("app.language.en"), value: "en" },
  { title: t("app.language.pl"), value: "pl" },
  { title: t("app.language.mx"), value: "mx" },
]);

const presentationFilterDefinitions = computed<FilterDefinition[]>(() => [
  { ...presentationFilterDefs[0], options: statusFilterOptions.value },
  { ...presentationFilterDefs[1], options: localeFilterOptions.value },
]);

const {
  searchQuery, filterState, activeFilterCount, tableOptions,
  loading, clearingSearch, clearingFilters, loadError, items, total,
  hasActiveFiltersOrSearch, isTrulyEmpty,
  onFilterStateUpdate, onFiltersClear, onSearchClear,
  onOptionsUpdate, loadData,
} = useEntityList({
  viewId: "presentations",
  apiEndpoint: "/api/v1/presentation",
  filterDefinitions: presentationFilterDefs,
  i18n: { errorLoad: "user.presentations.errorLoad" },
  filterParamKeys: ["status", "locale"],
});

const isInitialLoading = computed(() => loading.value && items.value.length === 0);
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / tableOptions.value.itemsPerPage)));

function idOf(item: Record<string, unknown>): string {
  return String(item.id ?? "");
}
function titleOf(item: Record<string, unknown>): string {
  return typeof item.title === "string" ? item.title : "";
}
function thumbOf(item: Record<string, unknown>): string | null {
  return typeof item.thumbnail_url === "string" && item.thumbnail_url ? item.thumbnail_url : null;
}
function fileUrlOf(item: Record<string, unknown>): string {
  if (typeof item.url === "string" && item.url) return item.url;
  return typeof item.file_url === "string" ? item.file_url : "";
}
/**
 * Derives a display file type from the URL's extension. There is no
 * `file_type` column on `presentation` — PresentationViewer.vue needs a
 * pdf/pptx hint to pick the right iframe embed, so it's computed client-side
 * from the file_url rather than trusted from a (non-existent) server field.
 */
function fileTypeOf(item: Record<string, unknown>): string {
  const match = /\.([a-z0-9]+)(?:[?#].*)?$/i.exec(fileUrlOf(item));
  const ext = match ? match[1].toLowerCase() : "";
  if (ext === "ppt" || ext === "pptx") return "pptx";
  return ext;
}

function coverVariant(id: string): number {
  return id.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % 5;
}

function openViewer(p: Record<string, unknown>) {
  selectedPresentation.value = {
    id: idOf(p),
    title: titleOf(p),
    url: fileUrlOf(p),
    file_type: fileTypeOf(p),
  };
  viewerOpen.value = true;
}

function onAdd() {
  editingItem.value = null;
  showForm.value = true;
}

function onEdit(p: Record<string, unknown>) {
  editingItem.value = { ...p };
  showForm.value = true;
}

async function onSubmit(payload: Record<string, unknown>, done: (ok: boolean) => void) {
  const isEdit = typeof payload.id === "string" && payload.id;
  const url = isEdit ? `/api/v1/presentation/${payload.id}` : "/api/v1/presentation";
  const method = isEdit ? "PATCH" : "POST";
  const { id, ...body } = payload;
  void id;
  try {
    const res = await apiFetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      notifications.show(
        t(isEdit ? "user.presentations.form.editSuccess" : "user.presentations.form.success"),
        "success",
      );
      editingItem.value = null;
      window.dispatchEvent(new Event("entity-list-refresh"));
      done(true);
    } else {
      done(false);
    }
  } catch {
    done(false);
  }
}
</script>

<style scoped src="../components/AppEntityList.css" />

<style scoped>
.view-presentations {
  max-width: 100%;
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
}

.view-presentations__loading {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.view-presentations__empty {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.view-presentations__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
}

.view-presentations__pagination {
  display: flex;
  justify-content: center;
  margin-top: 20px;
  flex-shrink: 0;
}

/* --------------------------------------------------------------------------- */
/* Card – unstyled button so it's accessible */
/* --------------------------------------------------------------------------- */
.view-presentations__card {
  all: unset;
  display: flex;
  flex-direction: column;
  border-radius: var(--pwa-radius, 10px);
  overflow: hidden;
  cursor: pointer;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  background: rgb(var(--v-theme-surface));
  transition: box-shadow 0.2s ease, transform 0.15s ease;

  &:hover {
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.1);
    transform: translateY(-2px);
  }

  &:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: 2px;
  }
}

/* --------------------------------------------------------------------------- */
/* Cover image */
/* --------------------------------------------------------------------------- */
.view-presentations__cover {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  background: rgb(var(--v-theme-primary));
}

.view-presentations__cover-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.view-presentations__cover-placeholder {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;

  &.cover-variant-0 { background: linear-gradient(135deg, #128F83 0%, #0a3d5c 100%); }
  &.cover-variant-1 { background: linear-gradient(135deg, #1a237e 0%, #4a148c 100%); }
  &.cover-variant-2 { background: linear-gradient(135deg, #004d40 0%, #1565c0 100%); }
  &.cover-variant-3 { background: linear-gradient(135deg, #37474f 0%, #128F83 100%); }
  &.cover-variant-4 { background: linear-gradient(135deg, #4a148c 0%, #0d47a1 100%); }
}

.cover-shapes {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.view-presentations__cover-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  padding: 2px 6px;
  border-radius: 4px;
  backdrop-filter: blur(4px);
}

.view-presentations__edit-btn {
  position: absolute;
  top: 8px;
  left: 8px;
  background: rgba(0, 0, 0, 0.45) !important;
  color: #fff !important;
  backdrop-filter: blur(4px);
}

/* --------------------------------------------------------------------------- */
/* Card body */
/* --------------------------------------------------------------------------- */
.view-presentations__card-body {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
}

.view-presentations__card-icon {
  flex-shrink: 0;
  margin-top: 1px;
  color: rgb(var(--v-theme-primary));
}

.view-presentations__card-title {
  font-size: 0.8125rem;
  font-weight: 500;
  line-height: 1.3;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
