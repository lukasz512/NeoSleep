<template>
  <div class="view-dev">
    <PageSection
      :title="t('user.dev.title')"
      :subtitle="t('user.dev.subtitle')"
    />
    <VCard class="mt-4">
      <VCardTitle class="text-subtitle-1">{{ t("user.dev.loader.title") }}</VCardTitle>
      <VCardText>
        <p class="text-body-2 text-medium-emphasis mb-3">{{ t("user.dev.loader.hint") }}</p>
        <div class="d-flex gap-2 flex-wrap">
          <AppButton color="primary" variant="outlined" @click="triggerLoader">
            {{ t("user.dev.loader.trigger") }}
          </AppButton>
        </div>
      </VCardText>
    </VCard>
    <VCard class="mt-4">
      <VCardTitle class="text-subtitle-1">{{ t("user.dev.notifications.title") }}</VCardTitle>
      <VCardText>
        <p class="text-body-2 text-medium-emphasis mb-3">{{ t("user.dev.notifications.hint") }}</p>
        <div class="d-flex gap-2 flex-wrap">
          <AppButton color="success" variant="outlined" size="small" @click="showNotification('success')">
            {{ t("user.dev.notifications.success") }}
          </AppButton>
          <AppButton color="info" variant="outlined" size="small" @click="showNotification('info')">
            {{ t("user.dev.notifications.info") }}
          </AppButton>
          <AppButton color="warning" variant="outlined" size="small" @click="showNotification('warning')">
            {{ t("user.dev.notifications.warning") }}
          </AppButton>
          <AppButton color="error" variant="outlined" size="small" @click="showNotification('error')">
            {{ t("user.dev.notifications.error") }}
          </AppButton>
        </div>
      </VCardText>
    </VCard>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import AppButton from "../components/AppButton.vue";
import PageSection from "../components/PageSection.vue";
import { useGlobalLoaderStore } from "@stores";
import { useNotifications, type NotificationType } from "../composables/useNotifications";

const { t } = useI18n();
const { startLoading, stopLoading } = useGlobalLoaderStore();
const { show } = useNotifications();

function triggerLoader() {
  startLoading();
  setTimeout(() => stopLoading(), 2000);
}

function showNotification(type: NotificationType) {
  const key = `user.dev.notifications.sample.${type}`;
  const message = t(key);
  show(message, type);
}
</script>

<style scoped>
.view-dev {
  max-width: 640px;
}
</style>
