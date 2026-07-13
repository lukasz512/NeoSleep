<template>
  <svg
    :class="['view-home__icon-svg view-home__icon-clock', patients && 'view-home__icon-clock--patients']"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="10"/>
    <path d="M12 12 L15.5 10" class="view-home__icon-clock-hour"/>
    <g class="view-home__icon-clock-min-hand">
      <path d="M12 12 L12 5"/>
    </g>
  </svg>
</template>

<script setup lang="ts">
defineProps<{
  patients?: boolean;
}>();
</script>
