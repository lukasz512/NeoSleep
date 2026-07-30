<template>
  <VCard
    ref="cardEl"
    class="animated-card"
    :class="{ 'animated-card--visible': cardVisible }"
    :loading="loading ? 'primary' : false"
  >
    <div class="animated-card__content" :class="{ 'animated-card__content--visible': contentVisible }">
      <slot />
    </div>
  </VCard>
</template>

<script setup lang="ts">
import { onMounted, nextTick, ref } from "vue";

// autoPlay=false lets a parent orchestrate this card's entrance alongside
// other elements (see AuthView, which stages orbs → card → logo → badge)
// instead of it firing the moment this component mounts.
const { loading = false, autoPlay = true } = defineProps<{ loading?: boolean; autoPlay?: boolean }>();

// Generic entrance/exit choreography for any card: the card itself appears
// first, then its content follows a beat later; playExit() reverses that
// (content out, then the card) so callers can await it before navigating
// away, instead of the view vanishing instantly. Meant to be reused as the
// app's standard card shell, not just for the login screen.
const CARD_DURATION = 350;
const CONTENT_DURATION = 250;
const CONTENT_DELAY = 150;

const cardEl = ref<{ $el: HTMLElement } | null>(null);
const cardVisible = ref(false);
const contentVisible = ref(false);

const prefersReducedMotion =
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function playEnter(): Promise<void> {
  if (prefersReducedMotion) {
    cardVisible.value = true;
    contentVisible.value = true;
    return;
  }
  await nextTick();
  cardVisible.value = true;
  await wait(CONTENT_DELAY);
  contentVisible.value = true;
  await wait(CONTENT_DURATION);
}

onMounted(() => {
  if (autoPlay) playEnter();
});

async function playExit(): Promise<void> {
  if (prefersReducedMotion) return;
  contentVisible.value = false;
  await wait(CONTENT_DURATION);
  cardVisible.value = false;
  await wait(CARD_DURATION);
}

defineExpose({ playEnter, playExit });
</script>

<style scoped>
.animated-card {
  opacity: 0;
  transform: translateY(12px) scale(0.97);
  transition: opacity 0.35s cubic-bezier(0.22, 1, 0.36, 1), transform 0.35s cubic-bezier(0.22, 1, 0.36, 1);
}

.animated-card--visible {
  opacity: 1;
  transform: translateY(0) scale(1);
}

.animated-card__content {
  opacity: 0;
  transform: translateY(8px);
  transition: opacity 0.25s ease-out, transform 0.25s ease-out;
}

.animated-card__content--visible {
  opacity: 1;
  transform: translateY(0);
}

@media (prefers-reduced-motion: reduce) {
  .animated-card,
  .animated-card__content {
    transition: none;
  }
}

/* Vuetify's loading bar defaults to the card's top edge — moved to the
   bottom edge instead (the only current consumer is the auth card shell). */
.animated-card :deep(.v-card__loader) {
  top: auto;
  bottom: 0;
}
</style>
