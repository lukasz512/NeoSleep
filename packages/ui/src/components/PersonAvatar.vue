<script setup lang="ts">
import LazyImg from './LazyImg.vue'

defineProps<{
  photo?: string | null
  alt?: string
  fallbackColor?: string
}>()
</script>

<template>
  <div :style="photo ? {} : fallbackColor ? { background: fallbackColor } : {}">
    <LazyImg v-if="photo" :src="photo" :alt="alt ?? ''" />
    <svg v-else viewBox="0 0 80 90" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="40" cy="28" r="16" fill="rgba(255,255,255,0.92)" />
      <path d="M8 82 C8 62 72 62 72 82" fill="rgba(255,255,255,0.92)" />
    </svg>
  </div>
</template>
