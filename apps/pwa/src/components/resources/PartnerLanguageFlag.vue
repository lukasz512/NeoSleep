<template>
  <!-- Inline SVG, like AppFlag: Windows has no emoji flags (NEO-102). -->
  <svg class="partner-language-flag" viewBox="0 0 60 40" aria-hidden="true" v-html="FLAGS[code] ?? FALLBACK" />
</template>

<script setup lang="ts">
/**
 * Flag for a partner content language (OrthoApnea's own codes: es/en/de/fr/pt/nl),
 * not one of the app's locales — AppFlag covers those. The flag names the
 * language of the video, so Spanish uses Spain's flag: the webinars are
 * recorded in Spain (Łukasz, NEO-151).
 */
defineProps<{ code: string }>();

const FLAGS: Record<string, string> = {
  es: `<rect width="60" height="40" fill="#AA151B"/><rect y="10" width="60" height="20" fill="#F1BF00"/>`,
  en: `<rect width="60" height="40" fill="#012169"/>
       <path d="M0 0l60 40M60 0L0 40" stroke="#fff" stroke-width="8"/>
       <path d="M0 0l60 40M60 0L0 40" stroke="#C8102E" stroke-width="3"/>
       <path d="M30 0v40M0 20h60" stroke="#fff" stroke-width="12"/>
       <path d="M30 0v40M0 20h60" stroke="#C8102E" stroke-width="7"/>`,
  de: `<rect width="60" height="13.4" fill="#000"/><rect y="13.3" width="60" height="13.4" fill="#DD0000"/><rect y="26.6" width="60" height="13.4" fill="#FFCE00"/>`,
  fr: `<rect width="20" height="40" fill="#002395"/><rect x="20" width="20" height="40" fill="#fff"/><rect x="40" width="20" height="40" fill="#ED2939"/>`,
  pt: `<rect width="60" height="40" fill="#FF0000"/><rect width="24" height="40" fill="#006600"/><circle cx="24" cy="20" r="7" fill="#FFCC00"/>`,
  nl: `<rect width="60" height="13.4" fill="#AE1C28"/><rect y="13.3" width="60" height="13.4" fill="#fff"/><rect y="26.6" width="60" height="13.4" fill="#21468B"/>`,
};
const FALLBACK = `<rect width="60" height="40" fill="#9aa6a4"/>`;
</script>

<style scoped>
.partner-language-flag {
  display: block;
  flex-shrink: 0;
  width: 18px;
  height: 12px;
  border-radius: 2px;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.12);
}
</style>
