<template>
  <span class="flag-icon fi" :class="`fi-${countryCode.toLowerCase()}`" role="img" :aria-label="countryCode" />
</template>

<script setup lang="ts">
/**
 * Rectangular country flag (flag-icons SVG sprite, see assets/flags.css) —
 * used by PhoneField's area-code picker. Deliberately not emoji: regional-
 * indicator flag emoji render as bare two-letter codes on several platforms
 * (notably Windows), which is what made the previous flags invisible.
 */
defineProps<{
  /** ISO 3166-1 alpha-2 country code, e.g. "PL" — must have a matching .fi-xx rule in assets/flags.css. */
  countryCode: string;
}>();
</script>

<style scoped>
.flag-icon {
  flex-shrink: 0;
}
</style>
