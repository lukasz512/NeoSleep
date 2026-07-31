<template>
  <div class="view-resources">
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
      <AppSegmentedTabs v-model="tab" :options="tabOptions" class="view-resources__tabs" />

      <div class="view-resources__window">
        <template v-if="tab === 'documents'">
          <div v-if="documents.length === 0" class="view-resources__state">
            <AppEmptyState :title="t('user.resources.emptyDocuments')" />
          </div>
          <template v-else>
            <section v-for="group in documentGroups" :key="group.category" class="view-resources__group">
              <h2 class="view-resources__category">{{ group.category }}</h2>
              <div v-for="subgroup in group.subgroups" :key="subgroup.subcategory ?? ''" class="view-resources__subgroup">
                <h3 v-if="subgroup.subcategory" class="view-resources__subcategory">{{ subgroup.subcategory }}</h3>
                <div class="view-resources__grid">
                  <div v-for="doc in subgroup.items" :key="doc.id" class="view-resources__card">
                    <a class="view-resources__card-tile" :href="doc.mediaUrl" target="_blank" rel="noopener">
                      <AppIcon name="file" class="view-resources__card-icon" />
                      <span class="view-resources__card-title">{{ doc.title }}</span>
                    </a>
                    <div v-if="doc.languages.length > 1" class="view-resources__lang-row">
                      <a
                        v-for="lang in doc.languages"
                        :key="lang.code"
                        class="view-resources__lang-chip"
                        :href="lang.mediaUrl"
                        target="_blank"
                        rel="noopener"
                        :aria-label="lang.code.toUpperCase()"
                      >
                        {{ lang.code.toUpperCase() }}
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </template>
        </template>

        <template v-else>
          <div v-if="videos.length === 0" class="view-resources__state">
            <AppEmptyState :title="t('user.resources.emptyVideos')" />
          </div>
          <template v-else>
            <section v-for="group in videoGroups" :key="group.category" class="view-resources__group">
              <h2 class="view-resources__category">{{ group.category }}</h2>
              <div v-for="subgroup in group.subgroups" :key="subgroup.subcategory ?? ''" class="view-resources__grid view-resources__grid--videos">
                <div v-for="video in subgroup.items" :key="video.id" class="view-resources__video-card">
                  <video controls preload="none" class="view-resources__video" :src="video.mediaUrl" />
                  <span class="view-resources__card-title">{{ video.title }}</span>
                  <span v-if="video.description" class="view-resources__card-subtitle">{{ video.description }}</span>
                  <div v-if="video.languages.length > 1" class="view-resources__lang-row">
                    <a
                      v-for="lang in video.languages"
                      :key="lang.code"
                      class="view-resources__lang-chip"
                      :href="lang.mediaUrl"
                      target="_blank"
                      rel="noopener"
                      :aria-label="lang.code.toUpperCase()"
                    >
                      {{ lang.code.toUpperCase() }}
                    </a>
                  </div>
                </div>
              </div>
            </section>
          </template>
        </template>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import { AppSegmentedTabs } from "@ui";
import AppIcon from "../components/AppIcon.vue";
import AppLoadingState from "../components/AppLoadingState.vue";
import AppErrorState from "../components/AppErrorState.vue";
import AppEmptyState from "../components/AppEmptyState.vue";
import { usePartnerResources } from "../composables/usePartnerResources";
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
.view-resources {
  display: flex;
  flex-direction: column;
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

.view-resources__tabs {
  flex-shrink: 0;
  max-width: 320px;
}

.view-resources__window {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding-top: 20px;
}

.view-resources__group + .view-resources__group {
  margin-top: 28px;
}

.view-resources__category {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 12px;
}

.view-resources__subgroup + .view-resources__subgroup {
  margin-top: 16px;
}

.view-resources__subcategory {
  font-size: 0.8125rem;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  margin-bottom: 8px;
}

.view-resources__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
}

.view-resources__card {
  display: flex;
  flex-direction: column;
  border-radius: var(--pwa-radius, 10px);
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  background: rgb(var(--v-theme-surface));
  overflow: hidden;
  transition: box-shadow 0.2s ease, transform 0.15s ease;
}

.view-resources__card:hover {
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
}

.view-resources__card-tile {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 16px;
  text-decoration: none;
  color: inherit;
}

.view-resources__card-icon {
  color: rgb(var(--v-theme-primary));
  margin-bottom: 4px;
}

.view-resources__card-title {
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.3;
}

.view-resources__card-subtitle {
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.view-resources__lang-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 0 16px 14px;
}

.view-resources__lang-chip {
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(var(--v-theme-primary), 0.1);
  color: rgb(var(--v-theme-primary));
  text-decoration: none;
  transition: background 0.15s ease;
}

.view-resources__lang-chip:hover {
  background: rgba(var(--v-theme-primary), 0.18);
}

.view-resources__video-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  border-radius: var(--pwa-radius, 10px);
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  background: rgb(var(--v-theme-surface));
}

.view-resources__video {
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: 6px;
  background: #000;
}
</style>
