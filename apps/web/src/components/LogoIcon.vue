<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 32 32"
    fill="none"
    aria-hidden="true"
    :width="size"
    :height="size"
    class="logo-icon"
    :class="{ 'logo-icon--on-dark': onDark }"
  >
    <!-- Top crescent: teal -->
    <path fill="var(--neosleep-primary, #128F83)" d="M28 16 A 12 12 0 0 0 4 16" />
    <!-- Bottom crescent: inherits currentColor from parent -->
    <path fill="currentColor" d="M4 16 A 12 12 0 0 0 28 16" />
  </svg>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    size?: number;
    /** When true, bottom arc is white (for dark backgrounds) */
    onDark?: boolean;
  }>(),
  { size: 32, onDark: false }
);
</script>

<style scoped>
.logo-icon {
  flex-shrink: 0;
  color: var(--neosleep-charcoal-dark);
}

.logo-icon--on-dark {
  color: #fff;
}
</style>
