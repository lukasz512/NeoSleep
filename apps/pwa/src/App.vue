<template>
  <!-- Mounted once here, above the layout switch below, so it's available on
       the unauthenticated route tree (login, forgot/reset password) too, not
       just inside AppLayout. useNotifications() itself is a module-level
       singleton (see its own docblock), so a single top-level instance is
       all either layout ever needs. -->
  <AppNotifications />
  <component :is="layoutComponent" />
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { useI18n } from "vue-i18n";
import { PublicLayout, AppLayout } from "./router";
import { useDocumentLang } from "@i18n/useDocumentLang";
import AppNotifications from "./components/AppNotifications.vue";

const { locale } = useI18n();
useDocumentLang(locale);

const route = useRoute();
const layoutComponent = computed(() => {
  const name = (route.meta.layout as string) || "default";
  return name === "app" ? AppLayout : PublicLayout;
});
</script>
