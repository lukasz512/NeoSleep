<template>
  <nav class="mbn" role="navigation" aria-label="Mobile navigation">
    <MobileNavLink to="/" label-key="website.nav.home">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z"/><path d="M9 21V12h6v9"/>
      </svg>
    </MobileNavLink>

    <MobileNavTheme />
    <MobileNavLanguage />

    <MobileNavLink to="/contact" label-key="website.nav.contact">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    </MobileNavLink>
  </nav>
</template>

<script setup lang="ts">
import MobileNavLink from './MobileNavLink.vue'
import MobileNavTheme from './MobileNavTheme.vue'
import MobileNavLanguage from './MobileNavLanguage.vue'
</script>

<style>
/* display: none declared in @layer base inside website-theme.scss */
/* display: flex at ≤1100px declared in @layer responsive inside website-responsive.scss */
</style>
