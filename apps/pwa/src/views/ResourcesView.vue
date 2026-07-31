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

    <div v-else-if="loading && items.length === 0" class="view-resources__state">
      <AppLoadingState />
    </div>

    <template v-else>
      <div class="view-resources__tabs-bar d-flex align-center ga-3 py-2">
        <AppSegmentedTabs v-model="tab" :options="tabOptions" class="view-resources__tabs" />
        <AppSpinner v-if="loading" size="18" width="2" color="primary" />
      </div>

      <div class="view-resources__window">
        <Transition name="title-fade" mode="out-in">
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
                      <a class="view-resources__card-tile d-flex flex-column pa-4" :href="doc.mediaUrl" target="_blank" rel="noopener">
                        <AppIcon :name="fileTypeIcon(doc.fileType)" class="view-resources__card-icon mb-2" />
                        <span class="text-body-2 font-weight-bold">{{ doc.title }}</span>
                      </a>
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
                    <div class="d-flex flex-column mt-2">
                      <span class="text-body-2 font-weight-bold">{{ video.title }}</span>
                      <span v-if="video.description" class="text-caption text-medium-emphasis">{{ video.description }}</span>
                    </div>
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
import { ref, computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import { AppSegmentedTabs } from "@ui";
import AppIcon, { type AppIconName } from "../components/AppIcon.vue";
import AppLoadingState from "../components/AppLoadingState.vue";
import AppSpinner from "../components/AppSpinner.vue";
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
