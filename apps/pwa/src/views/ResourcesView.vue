<template>
  <div class="view-resources d-flex flex-column">
    <div v-if="loadError" class="view-resources__state">
      <AppErrorState
        :error="loadFailure"
        :refresh-label="t('app.errorState.refresh')"
        :loading="loading"
        :secondary-label="t('user.resources.reportIncident')"
        :secondary-href="incidentMailtoHref"
        @refresh="() => load(locale)"
      />
    </div>

    <template v-else>
      <div v-if="tabOptions.length > 1" class="view-resources__tabs-bar">
        <AppSegmentedTabs v-model="tab" :options="tabOptions" :compact="scrolled" class="view-resources__tabs" />
      </div>

      <div class="view-resources__window">
        <div v-if="loading && tab === 'videos'" class="view-resources__topics" aria-hidden="true">
          <section v-for="g in 2" :key="g" class="view-resources__topic">
            <div class="view-resources__skeleton-line view-resources__skeleton-line--heading" />
            <div class="view-resources__video-grid">
              <div v-for="n in 4" :key="n" class="view-resources__video-skeleton">
                <div class="view-resources__skeleton-thumb" />
                <div class="view-resources__skeleton-line" />
                <div class="view-resources__skeleton-line view-resources__skeleton-line--short" />
              </div>
            </div>
          </section>
        </div>

        <div v-else-if="loading" class="view-resources__grid" aria-hidden="true">
          <VCard
            v-for="n in 8"
            :key="n"
            variant="flat"
            rounded="lg"
            class="view-resources__card view-resources__card--skeleton bg-surface-container-low"
          >
            <div class="view-resources__card-tile d-flex flex-column pa-4">
              <VSkeletonLoader type="avatar" color="surface-container-high" class="view-resources__skeleton-icon mb-2" />
              <VSkeletonLoader type="text" color="surface-container-high" />
              <VSkeletonLoader type="text" color="surface-container-high" width="60%" />
            </div>
            <div class="view-resources__lang-row d-flex justify-end ga-2 px-4 pb-4">
              <VSkeletonLoader type="chip" color="surface-container-high" width="32" />
              <VSkeletonLoader type="chip" color="surface-container-high" width="32" />
            </div>
          </VCard>
        </div>

        <Transition v-else name="title-fade" mode="out-in">
          <div v-if="tab === 'documents'" key="documents">
            <div v-if="documents.length === 0" class="view-resources__state">
              <AppEmptyState :title="t('user.resources.emptyDocuments')" />
            </div>
            <template v-else>
              <section v-for="group in documentGroups" :key="group.category" class="view-resources__group">
                <h2 class="text-body-large font-weight-bold mb-3">{{ group.category }}</h2>
                <div v-for="subgroup in group.subgroups" :key="subgroup.subcategory ?? ''" class="view-resources__subgroup">
                  <h3 v-if="subgroup.subcategory" class="text-body-small font-weight-bold text-medium-emphasis mb-2">
                    {{ subgroup.subcategory }}
                  </h3>
                  <div class="view-resources__grid">
                    <VCard
                      v-for="doc in subgroup.items"
                      :key="doc.id"
                      variant="flat"
                      rounded="lg"
                      class="view-resources__card bg-surface-container-low"
                    >
                      <VTooltip location="bottom" :text="doc.title" open-delay="400" :disabled="!truncatedTitles[doc.id]">
                        <template #activator="{ props: tooltipProps }">
                          <a
                            v-bind="tooltipProps"
                            class="view-resources__card-tile d-flex flex-column pa-4"
                            :href="doc.mediaUrl"
                            target="_blank"
                            rel="noopener"
                          >
                            <AppIcon :name="fileTypeIcon(doc.fileType)" class="view-resources__card-icon mb-2" />
                            <span :ref="(el) => registerTitleEl(doc.id, el as Element | null)" class="view-resources__card-title text-body-medium font-weight-bold">
                              {{ doc.title }}
                            </span>
                          </a>
                        </template>
                      </VTooltip>
                      <div class="view-resources__lang-row d-flex flex-wrap justify-end ga-2 px-4 pb-4">
                        <a
                          v-for="lang in doc.languages"
                          :key="lang.code"
                          class="view-resources__lang-chip text-body-small font-weight-bold rounded-pill px-2 py-1"
                          :href="lang.mediaUrl"
                          target="_blank"
                          rel="noopener"
                          :aria-label="lang.code.toUpperCase()"
                        >
                          {{ lang.code.toUpperCase() }}
                        </a>
                      </div>
                    </VCard>
                  </div>
                </div>
              </section>
            </template>
          </div>

          <div v-else key="videos">
            <div v-if="videos.length === 0" class="view-resources__state">
              <AppEmptyState :title="t('user.resources.emptyVideos')" />
            </div>
            <template v-else>
              <!-- "Webinars" appears once per page (NEO-151): under the title on desktop
                   (page-header subtitle), and here only on phones, where the header has no subtitle line. -->
              <p class="view-resources__phone-subtitle">{{ videosSubtitle }}</p>
              <!-- Watch progress (NEO-209): overall meter + status chips (last choice remembered per user, D3). -->
              <div class="view-resources__progress" data-testid="resources-progress">
                <div class="view-resources__meter" role="progressbar" :aria-valuenow="counts.completed" aria-valuemin="0" :aria-valuemax="counts.all" :aria-label="watchedSummary">
                  <i :style="{ width: `${counts.all ? (counts.completed / counts.all) * 100 : 0}%` }" />
                </div>
                <span class="view-resources__meter-label">{{ watchedSummary }}</span>
              </div>
              <div class="view-resources__chips" role="group" :aria-label="t('user.resources.filter.label')">
                <button
                  v-for="option in STATUS_FILTERS"
                  :key="option"
                  type="button"
                  class="view-resources__chip"
                  :aria-pressed="statusFilter === option"
                  :data-testid="`resources-filter-${option}`"
                  @click="statusFilter = option"
                >
                  {{ t(`user.resources.filter.${option}`) }}
                  <span class="view-resources__chip-count">{{ counts[option] }}</span>
                </button>
              </div>
              <div v-if="topicGroups.length === 0" class="view-resources__state view-resources__state--filtered">
                <AppEmptyState :title="t('user.resources.filter.empty')" />
              </div>
              <!-- Topics = stages of the dentist's work with a patient (NEO-151), in that order. -->
              <div class="view-resources__topics">
                <section v-for="group in topicGroups" :key="group.topic" class="view-resources__topic">
                  <h2 class="view-resources__topic-title">
                    {{ t(`user.resources.topic.${group.topic}`) }}
                    <span class="view-resources__topic-count">
                      {{ t("user.resources.progress.summary", { watched: group.watched, total: group.total }) }}
                    </span>
                  </h2>
                  <div class="view-resources__video-grid" :class="{ 'view-resources__video-grid--list': layout === 'list' }">
                    <ResourceVideoTile
                      v-for="video in group.videos"
                      :key="video.id"
                      :video="video"
                      :layout="layout === 'list' ? 'row' : 'card'"
                      @open="openVideo = video"
                    />
                  </div>
                </section>
              </div>
            </template>
          </div>
        </Transition>
      </div>
      <ResourceVideoSheet :video="openVideo" @close="openVideo = null" />
      <!-- Cards | list (NEO-151): desktop and tablet only, in the page header next to the title. -->
      <Teleport v-if="wide && tab === 'videos' && videos.length" :to="pageHeader.to" defer :disabled="pageHeader.disabled.value">
        <div class="view-resources__layout-toggle" role="group" :aria-label="t('user.resources.layout.label')">
          <button
            v-for="option in LAYOUTS"
            :key="option.value"
            type="button"
            class="view-resources__layout-option"
            :aria-pressed="savedLayout === option.value"
            :title="t(option.label)"
            :aria-label="t(option.label)"
            :data-testid="`resources-layout-${option.value}`"
            @click="setLayout(option.value)"
          >
            <AppIcon :name="option.icon" />
          </button>
        </div>
      </Teleport>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onUnmounted, onBeforeUnmount } from "vue";
import { useI18n } from "vue-i18n";
import { AppSegmentedTabs } from "@ui";
import AppIcon, { type AppIconName } from "../components/AppIcon.vue";
import AppErrorState from "../components/AppErrorState.vue";
import AppEmptyState from "../components/AppEmptyState.vue";
import ResourceVideoTile from "../components/resources/ResourceVideoTile.vue";
import ResourceVideoSheet from "../components/resources/ResourceVideoSheet.vue";
import { usePartnerResources, type PartnerResourceFileType, type PartnerResourceItem } from "../composables/usePartnerResources";
import { useResourceProgress, countByStatus, filterByStatus, type StatusFilter } from "../composables/useResourceProgress";
import { usePersistedState } from "@prefs";
import { usePageHeaderRow, usePageHeaderTeleport } from "../composables/usePageHeader";
import { useMediaQuery } from "@vueuse/core";
import { getUserSettings, setUserSettings } from "../utils/user-settings";
import { MOBILE_BREAKPOINT } from "../config/layout";
import { useAuthStore } from "../stores/auth";
import { SUPPORT_EMAIL } from "../config/support";

const { t, locale } = useI18n();
const { documents, videos, documentGroups, loading, loadError, loadFailure, load } = usePartnerResources();
const authStore = useAuthStore();

// Documents tab hidden per product decision — only Webinars (the renamed
// Videos tab) is shown. Data is still fetched as before (usePartnerResources
// keeps returning documents too); this is a UI-only filter, not a backend
// change, so nothing here regresses if Documents comes back later.
const tab = ref<"documents" | "videos">("videos");
const tabOptions = computed(() => [{ value: "videos", label: t("user.resources.tabs.videos") }]);

watch(locale, (l) => load(l), { immediate: true });

/**
 * Watch progress (NEO-209): each user's own, from the API on every visit so
 * another device's progress shows up. Counts are over all videos; the chip
 * only filters which tiles show.
 */
const { progress, load: loadProgress } = useResourceProgress();
onMounted(() => void loadProgress());
const STATUS_FILTERS: StatusFilter[] = ["all", "not_started", "in_progress", "completed"];
const statusFilter = usePersistedState<StatusFilter>("view:resources:statusFilter", "all", {
  validate: (v) => (STATUS_FILTERS.includes(v) ? v : "all"),
});
const counts = computed(() => countByStatus(videos.value, progress));
const watchedSummary = computed(() => t("user.resources.progress.summary", { watched: counts.value.completed, total: counts.value.all }));

/** Stage order comes from the API (VIDEO_TOPICS); a video without a known stage goes last, under "other". */
const TOPIC_ORDER = ["detect", "diagnose", "records", "order", "followup", "other"] as const;
type Topic = (typeof TOPIC_ORDER)[number];
interface TopicGroup {
  topic: Topic;
  videos: PartnerResourceItem[];
  watched: number;
  total: number;
}
const topicGroups = computed(() =>
  TOPIC_ORDER.map((topic): TopicGroup => {
    const all = videos.value.filter((v) => ((TOPIC_ORDER as readonly string[]).includes(v.topic ?? "") ? v.topic : "other") === topic);
    return {
      topic,
      videos: filterByStatus(all, progress, statusFilter.value),
      watched: countByStatus(all, progress).completed,
      total: all.length,
    };
  }).filter((g) => g.videos.length > 0)
);

/**
 * Cards or list (Łukasz, NEO-151): cards by default, the choice remembered on
 * this device (app settings). Phones always get cards — no toggle there.
 */
type ResourcesLayout = "cards" | "list";
const LAYOUTS: { value: ResourcesLayout; icon: AppIconName; label: string }[] = [
  { value: "cards", icon: "view-grid", label: "user.resources.layout.cards" },
  { value: "list", icon: "view-list", label: "user.resources.layout.list" },
];
const pageHeader = usePageHeaderTeleport();
const wide = useMediaQuery(`(min-width: ${MOBILE_BREAKPOINT}px)`);
const savedLayout = ref<ResourcesLayout>(getUserSettings().resourcesLayout ?? "cards");
const layout = computed<ResourcesLayout>(() => (wide.value ? savedLayout.value : "cards"));
function setLayout(value: ResourcesLayout): void {
  savedLayout.value = value;
  setUserSettings({ resourcesLayout: value });
}

/** The video playing in the cinema sheet — one at a time, so only one download runs. */
const openVideo = ref<PartnerResourceItem | null>(null);

/** Page subtitle (NEO-151): "Webinars · 15" under the Resources title; "" keeps its placeholder while loading. */
const videosSubtitle = computed(() => `${t("user.resources.tabs.videos")} · ${videos.value.length}`);
const headerRow = usePageHeaderRow();
let ownSubtitle: string | null = null;
watch(
  [videosSubtitle, loading, loadError],
  () => {
    ownSubtitle = loadError.value ? null : loading.value ? "" : videosSubtitle.value;
    headerRow.subtitle.value = ownSubtitle;
  },
  { immediate: true }
);
onBeforeUnmount(() => {
  // The next view may already have written its own line — only clear ours.
  if (headerRow.subtitle.value === ownSubtitle) headerRow.subtitle.value = null;
});

const FILE_TYPE_ICONS: Record<PartnerResourceFileType, AppIconName> = {
  pdf: "file-pdf",
  zip: "file-archive",
  image: "file-image",
  video: "file-video",
  other: "file",
};
function fileTypeIcon(fileType: PartnerResourceFileType): AppIconName {
  return FILE_TYPE_ICONS[fileType];
}

/**
 * Tooltip should only appear when the 2-line-clamped title is actually
 * truncated, not on every card regardless of length — checked once per
 * title element via its scrollHeight vs. its clamped clientHeight (the
 * standard way to detect CSS line-clamp truncation; there's no DOM
 * property that reports it directly). Not resize-reactive — a rare enough
 * edge case (rotating a device, resizing a desktop window) that it isn't
 * worth a ResizeObserver per card here.
 */
const truncatedTitles = reactive<Record<string, boolean>>({});
function registerTitleEl(id: string, el: Element | null): void {
  if (!(el instanceof HTMLElement)) return;
  truncatedTitles[id] = el.scrollHeight > el.clientHeight + 1;
}

/**
 * Drives AppSegmentedTabs' `compact` shrink. Previously an
 * IntersectionObserver watching a sentinel, on the theory that we didn't
 * reliably know which ancestor actually scrolls — that fix (moving the
 * sentinel out of `position: absolute`) didn't resolve it, so rather than
 * add a third layer of guessing on top, this replaces it with the simplest
 * thing that can possibly work: `window.scrollY` directly. The sticky-bar
 * fix (--v-layout-top) already established that this view's content
 * scrolls at the real page/window level, not inside some nested
 * `overflow: auto` div — so window scroll is the direct, correct signal
 * here, not a roundabout one.
 */
const scrolled = ref(false);
const SCROLL_COMPACT_THRESHOLD_PX = 8;

function handleWindowScroll(): void {
  scrolled.value = window.scrollY > SCROLL_COMPACT_THRESHOLD_PX;
}

onMounted(() => {
  window.addEventListener("scroll", handleWindowScroll, { passive: true });
});
onUnmounted(() => {
  window.removeEventListener("scroll", handleWindowScroll);
});

/** Interim manual reporting — see config/support.ts. */
const incidentMailtoHref = computed(() => {
  const subject = "NeoSleep — OrthoApnea connection issue";
  const body = [
    `Reported by: ${authStore.user?.email ?? "unknown"}`,
    `Time: ${new Date().toISOString()}`,
    "",
    "What were you trying to do when this happened?",
  ].join("\n");
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
});
</script>

<style scoped>
/* flex: 1 1 auto + min-height: 0 has no Vuetify utility equivalent — the
   min-height:0 half specifically is the standard fix for a flex child that
   needs to scroll internally instead of growing its parent past the
   viewport (AppLayout's fixed-height shell). */
.view-resources {
  flex: 1 1 auto;
  min-height: 0;
}

.view-resources__state {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Sticky rather than relying on being outside an internal overflow:auto
   container — AppLayout's content area turned out to scroll at the page
   level, not inside .view-resources__window, so the flex "keep it above the
   scroll area" approach never actually engaged. position: sticky pins it to
   whichever ancestor really is the scrolling context, so it doesn't depend
   on correctly diagnosing that chain.

   top is --v-layout-top (Vuetify's own app-bar-height variable — VMain.css
   sets `padding-top: var(--v-layout-top)` on itself, and custom properties
   inherit down through this component), not 0 — AppShell's <VMain> has no
   `scrollable` prop, so it doesn't reset that variable to 0 for its content
   the way VMain's scrollable mode does. `top: 0` stuck this bar at the true
   viewport top, i.e. sliding it underneath/behind the fixed app-bar instead
   of stopping right below it. */
.view-resources__tabs-bar {
  position: sticky;
  top: var(--v-layout-top, 56px);
  z-index: 2;
  flex-shrink: 0;
  padding-block: 8px;
  background: rgb(var(--v-theme-background));
}

.view-resources__tabs {
  width: 100%;
}
@media (min-width: 600px) {
  .view-resources__tabs {
    max-width: 320px;
  }
}

.view-resources__window {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding-top: 4px;
}

.view-resources__group + .view-resources__group {
  margin-top: 28px;
}

.view-resources__subgroup + .view-resources__subgroup {
  margin-top: 16px;
}

/* auto-fill/minmax responsive card grid has no Vuetify utility equivalent (VRow/VCol is a fixed 12-column grid, not content-driven auto-fill). */
.view-resources__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
}

/* M3 filled card: outline-variant border + surface-container-low tone
   (same recipe as AppEntityList.css's .app-entity-list__card) instead of
   VCard's default `outlined` variant, which draws a full-contrast
   --v-border-color line — too heavy/dark for a low-emphasis grid of tiles. */
.view-resources__card {
  border: 1px solid rgb(var(--v-theme-outline-variant));
  transition: box-shadow 0.2s ease, transform 0.15s ease;
}
.view-resources__card:hover {
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
}

/* Skeleton reuses the real card's classes for exact structural/dimensional
   parity (same fixed-height tile, same lang-row spot) — this just turns the
   hover lift back off, since it doesn't mean anything on a placeholder. */
.view-resources__card--skeleton:hover {
  box-shadow: none;
  transform: none;
}

.view-resources__skeleton-icon {
  width: 40px;
  height: 40px;
}
.view-resources__skeleton-icon :deep(.v-skeleton-loader__avatar) {
  width: 40px;
  height: 40px;
  margin: 0;
  border-radius: 8px;
}

.view-resources__card-tile {
  text-decoration: none;
  color: inherit;
  /* Fixed height so every tile lines up regardless of title length: icon
     (40px + 8px margin) + a 2-line-clamped title at this line-height. */
  height: 116px;
  /* VTooltip's activator slot wraps this in its own element, which doesn't
     reliably preserve the VCard-driven width otherwise — without an
     explicit 100%, the line-clamp box below sizes to its content instead of
     the card, so text overflows the card's edge sideways instead of
     wrapping/truncating within it. */
  width: 100%;
}

/* Line-clamp has no Vuetify utility — this is the standard 2-line-truncate
   trick (-webkit-box is non-standard but universally supported). Full text
   is still available via the VTooltip wrapping this tile. */
.view-resources__card-title {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.3;
}

/* Reserves the same vertical space on every card whether it has 1 language
   or 6 — a genuine max-height clip would hide real language options, so
   this is min-height (alignment), not a hard cap. */
.view-resources__lang-row {
  min-height: 32px;
}

/* "Much bigger" per feedback — file-type icons are meant to carry real information at a glance. */
.view-resources__card-icon {
  width: 40px;
  height: 40px;
  color: rgb(var(--v-theme-primary));
}

.view-resources__lang-chip {
  background: rgba(var(--v-theme-primary), 0.1);
  color: rgb(var(--v-theme-primary));
  text-decoration: none;
  transition: background 0.15s ease;
}
.view-resources__lang-chip:hover {
  background: rgba(var(--v-theme-primary), 0.18);
}

/* Phones only: AppLayout shows the page subtitle on desktop (>= 768 px, MOBILE_BREAKPOINT). */
.view-resources__phone-subtitle {
  display: none;
  margin: 0 0 12px;
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-variant-numeric: tabular-nums;
}
@media (max-width: 767.98px) {
  .view-resources__phone-subtitle {
    display: block;
  }
}

/* Small cards (NEO-151, variant B): 4 per row on desktop, 3 on tablet, 2 on phone.
   Container query, not viewport — the content column's width depends on the side menu. */
.view-resources__topics {
  container-type: inline-size;
  display: flex;
  flex-direction: column;
  gap: 28px;
  padding-bottom: 16px;
}
.view-resources__topic-title {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 0 0 12px;
  font-size: 1rem;
  font-weight: 650;
  line-height: 1.3;
}
.view-resources__topic-count {
  font-size: 0.75rem;
  font-weight: 500;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-variant-numeric: tabular-nums;
}
.view-resources__video-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px 12px;
}
@container (min-width: 560px) {
  .view-resources__video-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
@container (min-width: 860px) {
  .view-resources__video-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 20px 16px;
  }
}

.view-resources__video-grid--list {
  grid-template-columns: minmax(0, 1fr) !important;
  gap: 0 !important;
}

/* Watch progress (NEO-209): one meter line, then the status chips. */
.view-resources__progress {
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: 480px;
  margin-bottom: 12px;
}
.view-resources__meter {
  flex: 1;
  height: 6px;
  border-radius: 3px;
  overflow: hidden;
  background: rgba(var(--v-theme-on-surface), 0.08);
}
.view-resources__meter i {
  display: block;
  height: 100%;
  border-radius: 3px;
  background: rgb(var(--v-theme-primary));
  transition: width 0.4s ease;
}
.view-resources__meter-label {
  flex: none;
  font-size: 0.8125rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.view-resources__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 24px;
}
/* Phones: one scrolling row, like the record tabs (NEO-61), never two lines of chips. */
@media (max-width: 599.98px) {
  .view-resources__chips {
    flex-wrap: nowrap;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .view-resources__chips::-webkit-scrollbar {
    display: none;
  }
}
.view-resources__chip {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  border: 1px solid rgb(var(--v-theme-outline-variant));
  border-radius: 999px;
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
  font: inherit;
  font-size: 0.8125rem;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}
.view-resources__chip:hover {
  background: rgba(var(--v-theme-primary), 0.06);
}
.view-resources__chip[aria-pressed="true"] {
  border-color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.12);
  color: rgb(var(--v-theme-primary));
  font-weight: 600;
}
.view-resources__chip:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 1px;
}
.view-resources__chip-count {
  font-variant-numeric: tabular-nums;
  opacity: 0.72;
}
.view-resources__state--filtered {
  padding-block: 32px;
}

/* Cards | list toggle: a quiet segmented pair, like the theme row in the account menu. */
.view-resources__layout-toggle {
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  border-radius: 999px;
  background: rgba(var(--v-theme-on-surface), 0.06);
}
.view-resources__layout-option {
  display: grid;
  place-items: center;
  width: 36px;
  height: 30px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease;
}
.view-resources__layout-option .app-icon {
  width: 18px;
  height: 18px;
}
.view-resources__layout-option[aria-pressed="true"] {
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-primary));
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}
.view-resources__layout-option:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 1px;
}

/* Skeleton in the shape of the cards: frame, two title lines. */
.view-resources__video-skeleton {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.view-resources__skeleton-thumb,
.view-resources__skeleton-line {
  background: linear-gradient(
    100deg,
    rgb(var(--v-theme-surface-container-high)) 30%,
    rgba(var(--v-theme-on-surface), 0.08) 50%,
    rgb(var(--v-theme-surface-container-high)) 70%
  );
  background-size: 220% 100%;
  animation: view-resources-shimmer 1.4s linear infinite;
}
.view-resources__skeleton-thumb {
  aspect-ratio: 16 / 9;
  border-radius: 10px;
}
.view-resources__skeleton-line {
  height: 10px;
  width: 90%;
  border-radius: 5px;
}
.view-resources__skeleton-line--short {
  width: 55%;
}
.view-resources__skeleton-line--heading {
  width: 140px;
  height: 14px;
  margin-bottom: 14px;
}
@keyframes view-resources-shimmer {
  from {
    background-position: 120% 0;
  }
  to {
    background-position: -120% 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .view-resources__skeleton-thumb,
  .view-resources__skeleton-line {
    animation: none;
  }
}
</style>
