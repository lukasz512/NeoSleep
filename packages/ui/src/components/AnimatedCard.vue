<template>
  <VCard
    ref="cardEl"
    class="animated-card"
    :class="[`animated-card--${motion}`, { 'animated-card--visible': cardVisible, 'animated-card--leaving': cardLeaving }]"
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
const { loading = false, autoPlay = true, motion = "lift" } = defineProps<{
  loading?: boolean;
  autoPlay?: boolean;
  /**
   * "lift" (default): rises slightly into place. "zoom": grows out of a point
   * behind it — AuthView uses this so the card reads as emerging from the
   * breathing orbs; on exit it melts forward toward the viewer (slight swell,
   * blur, fade) rather than shrinking away.
   */
  motion?: "lift" | "zoom";
}>();

// Generic entrance/exit choreography for any card: the card itself appears
// first, then its content follows a beat later; playExit() reverses that
// (content out, then the card) so callers can await it before navigating
// away, instead of the view vanishing instantly. Meant to be reused as the
// app's standard card shell, not just for the login screen.
const CARD_DURATION = { lift: 350, zoom: 450 } as const;
const CONTENT_DURATION = 250;
const CONTENT_DELAY = { lift: 150, zoom: 260 } as const;

const cardEl = ref<{ $el: HTMLElement } | null>(null);
const cardVisible = ref(false);
const contentVisible = ref(false);
// Exit-only state, so "zoom" can leave differently from how it arrived: it
// enters from small, but leaves toward the viewer instead of shrinking back.
const cardLeaving = ref(false);

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
  cardLeaving.value = false;
  cardVisible.value = true;
  await wait(CONTENT_DELAY[motion]);
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
  cardLeaving.value = true;
  cardVisible.value = false;
  await wait(CARD_DURATION[motion]);
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

/* Grows out of a point behind the card (the orb cluster, in AuthView) — fast
   at the start, a long soft landing at the end. The blur makes it read as
   condensing out of the orbs rather than a flat sticker scaling up. */
.animated-card--zoom {
  transform: scale(0.3);
  filter: blur(10px);
  transition:
    opacity 0.45s cubic-bezier(0.16, 1, 0.3, 1),
    transform 0.8s cubic-bezier(0.16, 1, 0.3, 1),
    filter 0.6s cubic-bezier(0.16, 1, 0.3, 1);
}

.animated-card--zoom.animated-card--visible {
  transform: scale(1);
  filter: blur(0);
}

/* Exit: melts forward, toward the viewer — the same direction the orbs then
   take (AuthOrbs' exit) — instead of shrinking back into them, which read as
   the whole scene collapsing. Accelerating (ease-in) so the orbs can take over
   straight after. */
.animated-card--zoom.animated-card--leaving {
  transform: scale(1.08);
  filter: blur(12px);
  transition:
    opacity 0.4s cubic-bezier(0.55, 0, 1, 0.45),
    transform 0.45s cubic-bezier(0.55, 0, 1, 0.45),
    filter 0.45s cubic-bezier(0.55, 0, 1, 0.45);
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
  .animated-card__content,
  .animated-card--zoom,
  .animated-card--zoom.animated-card--leaving {
    transition: none;
    filter: none;
  }
}

/* Vuetify's loading bar defaults to the card's top edge — moved to the
   bottom edge instead (the only current consumer is the auth card shell). */
.animated-card :deep(.v-card__loader) {
  top: auto;
  bottom: 0;
}
</style>
