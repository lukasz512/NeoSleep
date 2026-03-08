<template>
  <div class="layout-app">
    <aside class="layout-app__sidebar" aria-label="App navigation">
      <p class="layout-app__sidebar-label">{{ t("layout.sidebar.placeholder") }}</p>
    </aside>
    <main class="layout-app__main">
      <router-view />
    </main>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";

const { t } = useI18n();
</script>

<style scoped>
.layout-app {
  display: grid;
  grid-template-columns: auto 1fr;
  min-height: 100vh;
}
.layout-app__sidebar {
  width: 200px;
  padding: 16px;
  background: #f5f5f5;
  border-right: 1px solid #e0e0e0;
}
.layout-app__sidebar-label {
  margin: 0;
  font-size: 0.875rem;
  color: #666;
}
.layout-app__main {
  padding: 16px;
}
</style>
