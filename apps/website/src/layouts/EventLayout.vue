<template>
  <div class="layout-event">
    <DefaultHeader />
    <main class="layout-event__main">
      <slot />
    </main>
    <footer class="layout-event__footer">
      <div class="page-container layout-event__footer-inner">
        <img :src="logoSrc" alt="NeoSleep" class="layout-event__logo" width="110" height="25" />
        <div class="layout-event__footer-right">
          <span class="layout-event__tagline">Powered by AI</span>
          <span class="layout-event__sep" aria-hidden="true">·</span>
          <span class="layout-event__copy">© {{ year }} NeoSleep</span>
        </div>
      </div>
    </footer>
    <MobileBottomNav />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import DefaultHeader from "./DefaultHeader.vue";
import MobileBottomNav from "../components/MobileBottomNav.vue";
import { useTheme } from "../composables/useTheme";

const { isDark } = useTheme();
const year = new Date().getFullYear();

const logoSrc = computed(() =>
  isDark.value ? "/brand/logos/logo/logo_dark.svg" : "/brand/logos/logo/logo_light.svg"
);
</script>

<style scoped>
.layout-event {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.layout-event__main {
  flex: 1;
  padding-top: var(--website-header-height);
}

.layout-event__footer {
  border-top: 1px solid var(--website-border);
  padding: 1.5rem 0;
}

.layout-event__footer-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: nowrap;

  @media (max-width: 600px) {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
  }
}

.layout-event__logo {
  height: 24px;
  width: auto;
  display: block;
  flex-shrink: 0;
}

.layout-event__footer-right {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}

.layout-event__tagline {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--website-primary);
  letter-spacing: 0.04em;
  white-space: nowrap;
}

.layout-event__sep {
  font-size: 0.8125rem;
  color: var(--website-text-secondary);
}

.layout-event__copy {
  font-size: 0.8125rem;
  color: var(--website-text-secondary);
  white-space: nowrap;
}

@media (max-width: 1100px) {
  .layout-event {
    padding-bottom: var(--website-bottom-nav-height);
  }
}
</style>
