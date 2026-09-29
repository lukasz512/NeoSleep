<template>
  <!-- Inline SVG rather than the emoji in LANGUAGE_OPTIONS: Windows has no
       emoji flags and shows the letters "GB" / "PL" / "MX" instead (NEO-102). -->
  <svg class="app-flag" viewBox="0 0 60 40" aria-hidden="true" v-html="FLAGS[locale]" />
</template>

<script setup lang="ts">
import type { LocaleId } from "@i18n/language-options";

defineProps<{
  /** The app's locale id — `mx` is Mexican Spanish, hence the Mexican flag. */
  locale: LocaleId;
}>();

const FLAGS: Record<LocaleId, string> = {
  en: `<rect width="60" height="40" fill="#012169"/>
       <path d="M0 0l60 40M60 0L0 40" stroke="#fff" stroke-width="8"/>
       <path d="M0 0l60 40M60 0L0 40" stroke="#C8102E" stroke-width="3"/>
       <path d="M30 0v40M0 20h60" stroke="#fff" stroke-width="12"/>
       <path d="M30 0v40M0 20h60" stroke="#C8102E" stroke-width="7"/>`,
  pl: `<rect width="60" height="20" fill="#fff"/><rect y="20" width="60" height="20" fill="#DC143C"/>`,
  mx: `<rect width="20" height="40" fill="#006847"/><rect x="20" width="20" height="40" fill="#fff"/>
       <rect x="40" width="20" height="40" fill="#CE1126"/><circle cx="30" cy="20" r="5" fill="#8A5A2B"/>`,
};
</script>

<style scoped>
.app-flag {
  display: block;
  width: 24px;
  height: 16px;
  border-radius: 3px;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.08);
}
</style>
