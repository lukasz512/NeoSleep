<template>
  <VProgressCircular indeterminate :color="color" :size="size" :width="width" />
</template>

<script setup lang="ts">
/**
 * Every spinning-circle loading indicator in the app renders through here —
 * AppLoadingState's full-page spinner, AppEntityList's load-more spinner,
 * and every AppButton's in-flight loading state. Swap the visual (or
 * replace VProgressCircular with something else entirely) in this one file
 * and it changes everywhere at once, instead of hunting down every call
 * site individually.
 */
import { VProgressCircular } from "vuetify/components";

withDefaults(
  defineProps<{
    size?: string | number;
    width?: string | number;
    color?: string;
  }>(),
  {
    size: 24,
    width: 2,
    color: "primary",
  },
);
</script>
