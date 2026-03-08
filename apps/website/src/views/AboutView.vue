<template>
  <div class="view-about">
    <h1>{{ t("website.about.title") }}</h1>
    <p>{{ t("website.about.subtitle") }}</p>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";

const { t } = useI18n();
</script>

<style scoped>
.view-about {
  max-width: 640px;
}
</style>
