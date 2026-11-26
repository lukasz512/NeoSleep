<script setup lang="ts">
import { ref } from 'vue'

defineOptions({ inheritAttrs: false })

defineProps<{
  src: string
  alt?: string
}>()

const loaded = ref(false)
</script>

<template>
  <img
    v-bind="$attrs"
    :src="src"
    :alt="alt ?? ''"
    loading="lazy"
    decoding="async"
    :class="['neo-img', { 'neo-img--loaded': loaded }]"
    @load="loaded = true"
  />
</template>

<style>
.neo-img {
  opacity: 0;
  filter: blur(8px);
  transform: scale(1.03);
  transition:
    opacity   0.6s cubic-bezier(0.4, 0, 0.2, 1),
    filter    0.5s cubic-bezier(0.4, 0, 0.2, 1),
    transform 0.7s cubic-bezier(0.4, 0, 0.2, 1);
  will-change: opacity, filter, transform;
}

.neo-img--loaded {
  opacity: 1;
  filter: blur(0);
  transform: scale(1);
}
</style>
