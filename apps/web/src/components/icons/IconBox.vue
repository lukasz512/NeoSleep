<template>
  <div :class="boxClass" aria-hidden="true">
    <slot />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    cardIcon?: boolean;
    featureIcon?: boolean;
    featureItemIcon?: boolean;
  }>(),
  { cardIcon: false, featureIcon: false, featureItemIcon: false }
);

const boxClass = computed(() => {
  const c = ["view-home__icon-box"];
  if (props.cardIcon) c.push("view-home__card-icon");
  if (props.featureIcon) c.push("view-home__feature-icon");
  if (props.featureItemIcon) c.push("view-home__feature-item-icon");
  return c;
});
</script>
