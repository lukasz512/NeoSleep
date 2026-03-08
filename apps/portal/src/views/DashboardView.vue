<template>
  <div class="view-dashboard">
    <h1>{{ t("portal.dashboard.title") }}</h1>
    <p>{{ t("portal.dashboard.subtitle") }}</p>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";

const { t } = useI18n();
</script>

<style scoped>
.view-dashboard {
  max-width: 640px;
}
</style>
