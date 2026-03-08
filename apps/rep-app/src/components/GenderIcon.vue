<template>
  <VIcon
    v-if="gender"
    :icon="gender === 'male' ? 'mdi-gender-male' : 'mdi-gender-female'"
    class="gender-icon"
    size="small"
    aria-hidden="true"
  />
</template>

<script setup lang="ts">
import type { Gender } from "../utils/genderFromName";

defineProps<{
  gender: Gender | null;
}>();
</script>

<style lang="scss" scoped>
.gender-icon {
  opacity: 0.5;
  flex-shrink: 0;
}
</style>
