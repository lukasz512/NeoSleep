<template>
  <div class="mbn">
    <MobileBottomNavBar aria-label="Mobile navigation">
      <MobileBottomNavItem to="/" :label="t('website.nav.home')" @click="onNavClick('/', $event)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z"/><path d="M9 21V12h6v9"/>
        </svg>
      </MobileBottomNavItem>

      <MobileNavTheme />
      <MobileNavLanguage />

      <MobileBottomNavItem to="/contact" :label="t('website.nav.contact')" @click="onNavClick('/contact', $event)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      </MobileBottomNavItem>
    </MobileBottomNavBar>
  </div>
</template>

<script setup lang="ts">
import { useRoute } from "vue-router";
import { useI18n } from "vue-i18n";
import { MobileBottomNavBar, MobileBottomNavItem } from "@ui";
import MobileNavTheme from './MobileNavTheme.vue'
import MobileNavLanguage from './MobileNavLanguage.vue'
import { smoothScrollToTop } from '../composables/useSmoothScrollAnchors'

const { t } = useI18n();
const route = useRoute();

// Tapping the already-active item scrolls this (single-page-feeling) site
// back to top instead of no-op navigating to where you already are.
function onNavClick(to: string, event: MouseEvent) {
  if (route.path === to) {
    event.preventDefault();
    smoothScrollToTop();
  }
}
</script>

<style>
/* display: none declared in @layer base inside website-theme.scss */
/* display: contents at ≤1024px declared in @layer responsive inside website-responsive.scss */
</style>
