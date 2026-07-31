<template>
  <div class="view-resources d-flex flex-column">
    <div v-if="loadError" class="view-resources__state">
      <AppErrorState
        :title="t('app.errorState.title')"
        :refresh-label="t('app.errorState.refresh')"
        :loading="loading"
        :secondary-label="t('user.resources.reportIncident')"
        :secondary-href="incidentMailtoHref"
        @refresh="() => load(locale)"
      />
    </div>

    <template v-else>
      <div ref="scrollSentinelEl" class="view-resources__scroll-sentinel" aria-hidden="true" />
      <div class="view-resources__tabs-bar">
        <AppSegmentedTabs v-model="tab" :options="tabOptions" :compact="scrolled" class="view-resources__tabs" />
      </div>

      <div class="view-resources__window">
        <div v-if="loading" class="view-resources__state view-resources__state--loading">
          <AppLoadingState />
        </div>

        <Transition v-else name="title-fade" mode="out-in">
          <div v-if="tab === 'documents'" key="documents">
            <div v-if="documents.length === 0" class="view-resources__state">
              <AppEmptyState :title="t('user.resources.emptyDocuments')" />
            </div>
            <template v-else>
              <section v-for="group in documentGroups" :key="group.category" class="view-resources__group">
                <h2 class="text-body-1 font-weight-bold mb-3">{{ group.category }}</h2>
                <div v-for="subgroup in group.subgroups" :key="subgroup.subcategory ?? ''" class="view-resources__subgroup">
                  <h3 v-if="subgroup.subcategory" class="text-caption font-weight-bold text-medium-emphasis mb-2">
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
                      <VTooltip location="bottom" :text="doc.title" open-delay="400">
                        <template #activator="{ props: tooltipProps }">
                          <a
                            v-bind="tooltipProps"
                            class="view-resources__card-tile d-flex flex-column pa-4"
                            :href="doc.mediaUrl"
                            target="_blank"
                            rel="noopener"
                          >
                            <AppIcon :name="fileTypeIcon(doc.fileType)" class="view-resources__card-icon mb-2" />
                            <span class="view-resources__card-title text-body-2 font-weight-bold">{{ doc.title }}</span>
                          </a>
                        </template>
                      </VTooltip>
                      <div class="view-resources__lang-row d-flex flex-wrap justify-end ga-2 px-4 pb-4">
                        <a
                          v-for="lang in doc.languages"
                          :key="lang.code"
                          class="view-resources__lang-chip text-caption font-weight-bold rounded-pill px-2 py-1"
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
              <section v-for="group in videoGroups" :key="group.category" class="view-resources__group">
                <h2 class="text-body-1 font-weight-bold mb-3">{{ group.category }}</h2>
                <div v-for="subgroup in group.subgroups" :key="subgroup.subcategory ?? ''" class="view-resources__grid view-resources__grid--videos">
                  <VCard v-for="video in subgroup.items" :key="video.id" variant="flat" rounded="lg" class="bg-surface-container-low pa-3">
                    <video controls preload="none" class="view-resources__video rounded-lg" :src="video.mediaUrl" />
                    <VTooltip location="bottom" :text="video.title" open-delay="400">
                      <template #activator="{ props: tooltipProps }">
                        <div v-bind="tooltipProps" class="d-flex flex-column mt-2">
                          <span class="view-resources__card-title text-body-2 font-weight-bold">{{ video.title }}</span>
                          <span v-if="video.description" class="text-caption text-medium-emphasis">{{ video.description }}</span>
                        </div>
                      </template>
                    </VTooltip>
                    <div class="view-resources__lang-row d-flex flex-wrap justify-end ga-2 mt-2">
                      <a
                        v-for="lang in video.languages"
                        :key="lang.code"
                        class="view-resources__lang-chip text-caption font-weight-bold rounded-pill px-2 py-1"
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
              </section>
            </template>
          </div>
        </Transition>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import { useI18n } from "vue-i18n";
import { AppSegmentedTabs } from "@ui";
import AppIcon, { type AppIconName } from "../components/AppIcon.vue";
import AppLoadingState from "../components/AppLoadingState.vue";
import AppErrorState from "../components/AppErrorState.vue";
import AppEmptyState from "../components/AppEmptyState.vue";
import { usePartnerResources, type PartnerResourceFileType } from "../composables/usePartnerResources";
import { useAuthStore } from "../stores/auth";
import { SUPPORT_EMAIL } from "../constants";

const { t, locale } = useI18n();
const { items, documents, videos, documentGroups, videoGroups, loading, loadError, load } = usePartnerResources();
const authStore = useAuthStore();

const tab = ref<"documents" | "videos">("documents");
const tabOptions = computed(() => [
  { value: "documents", label: t("user.resources.tabs.documents") },
  { value: "videos", label: t("user.resources.tabs.videos") },
]);

watch(locale, (l) => load(l), { immediate: true });

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
 * Drives AppSegmentedTabs' `compact` shrink — an IntersectionObserver on a
 * 1px sentinel placed right before the sticky tabs bar, rather than a
 * scroll listener on a specific element. We don't reliably know which
 * ancestor is the actual scrolling container in AppLayout's shell (already
 * got that wrong once for the sticky-positioning fix), so this avoids
 * needing to — it works the same whether the page itself scrolls or some
 * ancestor `overflow: auto` div does, since it walks up to find whichever
 * one actually has scrollable overflow and uses that as the observer root.
 */
const scrollSentinelEl = ref<HTMLElement | null>(null);
const scrolled = ref(false);
let scrollObserver: IntersectionObserver | null = null;

function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node) {
    const style = getComputedStyle(node);
    if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) return node;
    node = node.parentElement;
  }
  return null;
}

onMounted(() => {
  if (!scrollSentinelEl.value) return;
  scrollObserver = new IntersectionObserver(
    ([entry]) => { scrolled.value = !entry.isIntersecting; },
    { root: findScrollParent(scrollSentinelEl.value), threshold: 0 }
  );
  scrollObserver.observe(scrollSentinelEl.value);
});
onUnmounted(() => scrollObserver?.disconnect());

/** Interim manual reporting — see constants.ts SUPPORT_EMAIL comment. */
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

/* Loading replaces the content area only — tabs stay put (see Core
   principle #6, one canonical loading state: AppLoadingState, never a
   bespoke spinner). Bottom-anchored per feedback rather than dead-centered
   in the whole window, which read as floating awkwardly in a tall panel. */
.view-resources__state--loading {
  align-items: flex-end;
  padding-bottom: 15vh;
  min-height: 240px;
}

.view-resources__scroll-sentinel {
  position: absolute;
  height: 1px;
  width: 1px;
}

/* Sticky rather than relying on being outside an internal overflow:auto
   container — AppLayout's content area turned out to scroll at the page
   level, not inside .view-resources__window, so the flex "keep it above the
   scroll area" approach never actually engaged. position: sticky pins it to
   whichever ancestor really is the scrolling context, so it doesn't depend
   on correctly diagnosing that chain. */
.view-resources__tabs-bar {
  position: sticky;
  top: 0;
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

.view-resources__card-tile {
  text-decoration: none;
  color: inherit;
  /* Fixed height so every tile lines up regardless of title length: icon
     (40px + 8px margin) + a 2-line-clamped title at this line-height. */
  height: 116px;
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

.view-resources__video {
  width: 100%;
  aspect-ratio: 16 / 9;
  background: #000;
  display: block;
}
</style>
