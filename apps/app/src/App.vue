<template>
  <VApp>
    <AppNotificationHub />
    <component :is="layoutComponent" />
  </VApp>
</template>

<script setup lang="ts">
import { computed, watch, onMounted } from "vue";
import { useRoute } from "vue-router";
import { useI18n } from "vue-i18n";
import { DefaultLayout, AppLayout } from "./router";
import AppNotificationHub from "./components/AppNotificationHub.vue";

const route = useRoute();
const { locale } = useI18n();

function setDocumentLang(lang: string) {
  if (typeof document !== "undefined" && document.documentElement) {
    document.documentElement.lang = lang;
  }
}

watch(locale, setDocumentLang);
onMounted(() => setDocumentLang(locale.value));

const layoutComponent = computed(() => {
  const name = (route.meta.layout as string) || "default";
  return name === "app" ? AppLayout : DefaultLayout;
});
</script>

<style>
#app {
  font-family: system-ui, sans-serif;
}
a {
  color: var(--rep-primary, #128F83);
  text-decoration: none;
}
a:hover {
  color: var(--rep-primary-hover, #10544E);
}
</style>
