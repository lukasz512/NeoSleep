<template>
  <div class="view-dev">
    <PageSection
      :title="t('rep.dev.title')"
      :subtitle="t('rep.dev.subtitle')"
    />
    <VCard class="mt-4">
      <VCardTitle class="text-subtitle-1">{{ t("rep.dev.loader.title") }}</VCardTitle>
      <VCardText>
        <p class="text-body-2 text-medium-emphasis mb-3">{{ t("rep.dev.loader.hint") }}</p>
        <div class="d-flex gap-2 flex-wrap">
          <VBtn color="primary" variant="outlined" @click="triggerLoader">
            {{ t("rep.dev.loader.trigger") }}
          </VBtn>
        </div>
      </VCardText>
    </VCard>
    <VCard class="mt-4">
      <VCardTitle class="text-subtitle-1">{{ t("rep.dev.notifications.title") }}</VCardTitle>
      <VCardText>
        <p class="text-body-2 text-medium-emphasis mb-3">{{ t("rep.dev.notifications.hint") }}</p>
        <div class="d-flex gap-2 flex-wrap">
          <VBtn color="success" variant="outlined" size="small" @click="showNotification('success')">
            {{ t("rep.dev.notifications.success") }}
          </VBtn>
          <VBtn color="info" variant="outlined" size="small" @click="showNotification('info')">
            {{ t("rep.dev.notifications.info") }}
          </VBtn>
          <VBtn color="warning" variant="outlined" size="small" @click="showNotification('warning')">
            {{ t("rep.dev.notifications.warning") }}
          </VBtn>
          <VBtn color="error" variant="outlined" size="small" @click="showNotification('error')">
            {{ t("rep.dev.notifications.error") }}
          </VBtn>
        </div>
      </VCardText>
    </VCard>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import PageSection from "../components/PageSection.vue";
import { useGlobalLoader } from "../composables/useGlobalLoader";
import { useNotifications, type NotificationType } from "../composables/useNotifications";

const { t } = useI18n();
const { startLoading, stopLoading } = useGlobalLoader();
const { show } = useNotifications();

function triggerLoader() {
  startLoading();
  setTimeout(() => stopLoading(), 2000);
}

function showNotification(type: NotificationType) {
  const key = `rep.dev.notifications.sample.${type}`;
  const message = t(key);
  show(message, type);
}
</script>

<style scoped>
.view-dev {
  max-width: 640px;
}
</style>
