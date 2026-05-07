<template>
  <span
    :class="`fi fi-${code}`"
    class="c-flag"
    :style="{ width: `${w}px`, height: `${h}px` }"
    :aria-label="code.toUpperCase()"
    role="img"
  />
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
  defineProps<{ code: string; size?: number }>(),
  { size: 18 }
);

const h = computed(() => props.size);
const w = computed(() => Math.round(props.size * 1.333));
</script>

<style scoped>
.c-flag {
  display: inline-block;
  flex-shrink: 0;
  border-radius: 2px;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.09);
  vertical-align: middle;
}
</style>
