<template>
  <div class="view-resources">
    <div v-if="loadError" class="view-resources__state">
      <AppErrorState
        :title="t('app.errorState.title')"
        :refresh-label="t('app.errorState.refresh')"
        :loading="loading"
        @refresh="() => load(locale)"
      />
    </div>

    <div v-else-if="loading && items.length === 0" class="view-resources__state">
      <AppLoadingState />
    </div>

    <template v-else>
      <VTabs v-model="tab" class="view-resources__tabs">
        <VTab value="documents">{{ t("user.resources.tabs.documents") }}</VTab>
        <VTab value="videos">{{ t("user.resources.tabs.videos") }}</VTab>
      </VTabs>

      <VWindow v-model="tab" class="view-resources__window">
        <VWindowItem value="documents">
          <div v-if="documents.length === 0" class="view-resources__state">
            <AppEmptyState :title="t('user.resources.emptyDocuments')" />
          </div>
          <div v-else class="view-resources__grid">
            <a
              v-for="doc in documents"
              :key="doc.id"
              class="view-resources__card"
              :href="doc.mediaUrl"
              target="_blank"
              rel="noopener"
            >
              <AppIcon name="file" class="view-resources__card-icon" />
              <span class="view-resources__card-title">{{ doc.title }}</span>
              <span v-if="doc.description" class="view-resources__card-subtitle">{{ doc.description }}</span>
            </a>
          </div>
        </VWindowItem>

        <VWindowItem value="videos">
          <div v-if="videos.length === 0" class="view-resources__state">
            <AppEmptyState :title="t('user.resources.emptyVideos')" />
          </div>
          <div v-else class="view-resources__grid view-resources__grid--videos">
            <div v-for="video in videos" :key="video.id" class="view-resources__video-card">
              <video controls preload="none" class="view-resources__video" :src="video.mediaUrl" />
              <span class="view-resources__card-title">{{ video.title }}</span>
              <span v-if="video.description" class="view-resources__card-subtitle">{{ video.description }}</span>
            </div>
          </div>
        </VWindowItem>
      </VWindow>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import AppIcon from "../components/AppIcon.vue";
import AppLoadingState from "../components/AppLoadingState.vue";
import AppErrorState from "../components/AppErrorState.vue";
import AppEmptyState from "../components/AppEmptyState.vue";
import { usePartnerResources } from "../composables/usePartnerResources";

const { t, locale } = useI18n();
const { documents, videos, loading, loadError, load } = usePartnerResources();

const tab = ref<"documents" | "videos">("documents");

watch(locale, (l) => load(l), { immediate: true });
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
}

.view-resources__window {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding-top: 16px;
}

.view-resources__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
}

.view-resources__card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 16px;
  border-radius: var(--pwa-radius, 10px);
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  background: rgb(var(--v-theme-surface));
  text-decoration: none;
  color: inherit;
  transition: box-shadow 0.2s ease, transform 0.15s ease;
}

.view-resources__card:hover {
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
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
