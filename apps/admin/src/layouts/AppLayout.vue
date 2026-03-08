<template>
  <div class="layout-app">
    <aside class="layout-app__sidebar" aria-label="App navigation">
      <nav class="layout-app__nav">
        <RouterLink to="/dashboard" class="layout-app__nav-link" active-class="layout-app__nav-link--active">
          {{ t("admin.nav.dashboard") }}
        </RouterLink>
        <RouterLink to="/brand-settings" class="layout-app__nav-link" active-class="layout-app__nav-link--active">
          {{ t("admin.nav.brandSettings") }}
        </RouterLink>
      </nav>
    </aside>
    <main class="layout-app__main">
      <router-view />
    </main>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { RouterLink } from "vue-router";

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
.layout-app__nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.layout-app__nav-link {
  padding: 8px 12px;
  font-size: 0.9375rem;
  color: #333;
  text-decoration: none;
  border-radius: 6px;
  min-height: 44px;
  display: flex;
  align-items: center;
}

.layout-app__nav-link:hover {
  background: rgba(0, 0, 0, 0.06);
}

.layout-app__nav-link--active {
  background: rgba(25, 118, 210, 0.12);
  color: #1976d2;
}

.layout-app__main {
  padding: 16px;
}
</style>
