<template>
  <div class="view-login">
    <h1>{{ t("admin.login.title") }}</h1>
    <p>{{ t("admin.login.subtitle") }}</p>
    <router-link to="/dashboard">{{ t("app.common.ok") }}</router-link>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";

const { t } = useI18n();
</script>

<style scoped>
.view-login {
  max-width: 480px;
}
</style>
