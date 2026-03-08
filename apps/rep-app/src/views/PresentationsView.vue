<template>
  <div class="view-presentations">
    <div class="view-presentations__toolbar">
      <h2 class="view-presentations__title">{{ t("rep.presentations.title") }}</h2>
    </div>

    <div v-if="loading" class="view-presentations__loading">
      <VProgressLinear indeterminate color="primary" />
    </div>

    <div v-else-if="presentations.length === 0" class="view-presentations__empty">
      <AppEmptyState
        :title="t('rep.presentations.emptyTitle')"
        :subtitle="t('rep.presentations.emptySubtitle')"
        :show-add-button="isAdmin"
        :add-label="t('rep.presentations.add')"
        @add="onAdd"
      />
    </div>

    <div v-else class="view-presentations__grid">
      <VCard
        v-for="p in presentations"
        :key="p.id"
        variant="outlined"
        class="view-presentations__card"
        @click="openViewer(p)"
      >
        <VCardTitle class="view-presentations__card-title">
          <VIcon class="view-presentations__card-icon" :icon="p.file_type === 'pdf' ? 'mdi-file-pdf-box' : 'mdi-file-powerpoint-box'" />
          {{ p.title }}
        </VCardTitle>
        <VCardSubtitle class="view-presentations__card-subtitle">
          {{ p.file_type.toUpperCase() }}
        </VCardSubtitle>
      </VCard>
    </div>

    <PresentationViewer
      v-model="viewerOpen"
      :presentation="selectedPresentation"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import AppEmptyState from "../components/AppEmptyState.vue";
import PresentationViewer from "../components/PresentationViewer.vue";
import { useAuthStore } from "../stores/auth";
import { bffFetch } from "../composables/useBffApi";

interface Presentation {
  id: string;
  title: string;
  url: string;
  file_type: string;
}

const { t } = useI18n();
const authStore = useAuthStore();
const isAdmin = computed(() => authStore.user?.role === "admin");

const loading = ref(true);
const presentations = ref<Presentation[]>([]);
const viewerOpen = ref(false);
const selectedPresentation = ref<Presentation | null>(null);

async function loadPresentations() {
  loading.value = true;
  try {
    const res = await bffFetch("/api/presentations", { handleErrors: false });
    if (res.ok) {
      const data = (await res.json()) as { items: Presentation[] };
      presentations.value = data.items ?? [];
    } else {
      presentations.value = [];
    }
  } catch {
    presentations.value = [];
  } finally {
    loading.value = false;
  }
}

function openViewer(p: Presentation) {
  selectedPresentation.value = p;
  viewerOpen.value = true;
}

function onAdd() {
  // TODO: open add-presentation form / modal
}

onMounted(loadPresentations);
</script>

<style lang="scss" scoped>
.view-presentations {
  max-width: 100%;
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
}

.view-presentations__toolbar {
  margin-bottom: 20px;
}

.view-presentations__title {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 600;
}

.view-presentations__loading {
  flex: 1;
  padding: 24px;
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
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
}

.view-presentations__card {
  cursor: pointer;
  transition: box-shadow 0.2s ease, border-color 0.2s ease;
}

.view-presentations__card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.view-presentations__card-title {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 1rem;
}

.view-presentations__card-icon {
  flex-shrink: 0;
  color: rgb(var(--v-theme-primary));
}

.view-presentations__card-subtitle {
  margin-top: 4px;
}
</style>
