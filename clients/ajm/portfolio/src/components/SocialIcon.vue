<!-- Monochrome contact icons (they follow `color`), drawn at 24 px on a 24-unit grid. -->
<template>
  <svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <template v-if="name === 'email'">
      <rect x="3" y="5.5" width="18" height="13" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5" />
      <path d="M3.5 6.5l8.5 6.5 8.5-6.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
    </template>
    <template v-else-if="name === 'whatsapp'">
      <path
        d="M12 3.2a8.8 8.8 0 0 0-7.6 13.2L3.2 20.8l4.5-1.2A8.8 8.8 0 1 0 12 3.2z"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linejoin="round"
      />
      <path
        d="M9.1 7.9c.2-.4.4-.4.7-.4h.5c.2 0 .4 0 .5.4l.7 1.7c.1.2.1.4 0 .6l-.5.6c-.1.2-.2.3 0 .6.5.8 1.1 1.5 1.9 2 .3.2.5.2.6 0l.7-.8c.2-.2.3-.2.6-.1l1.6.8c.2.1.4.2.4.3 0 .5-.1 1.2-.6 1.6-.5.5-1.3.7-2 .6-1.2-.2-2.6-.9-3.9-2.2-1.3-1.3-2-2.6-2.2-3.8-.1-.8.2-1.5.6-1.9z"
        fill="currentColor"
      />
    </template>
    <template v-else-if="name === 'linkedin'">
      <rect x="3" y="3" width="18" height="18" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.5" />
      <path d="M7.5 10.5v6M7.5 7.6v.1M11 16.5v-6M11 13c0-1.6 1-2.6 2.4-2.6s2.1 1 2.1 2.6v3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
    </template>
    <template v-else>
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" fill="none" stroke="currentColor" stroke-width="1.5" />
      <circle cx="12" cy="12" r="3.8" fill="none" stroke="currentColor" stroke-width="1.5" />
      <circle cx="17.1" cy="6.9" r="1" fill="currentColor" />
    </template>
  </svg>
</template>

<script setup lang="ts">
defineProps<{ name: "email" | "whatsapp" | "linkedin" | "instagram" }>();
</script>

<style scoped>
.icon {
  width: 1em;
  height: 1em;
  flex: none;
}
</style>
