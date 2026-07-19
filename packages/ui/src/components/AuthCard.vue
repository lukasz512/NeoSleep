<template>
  <AnimatedCard ref="animatedCardRef" class="auth-card" :loading="loading">
    <div v-if="backTo || title" class="auth-card__back-row">
      <VBtn
        v-if="backTo"
        :to="backTo"
        icon
        variant="text"
        size="small"
        color="primary"
        class="auth-card__back"
        :aria-label="t('user.auth.back')"
        :title="t('user.auth.back')"
      >
        <VIcon icon="mdi-arrow-left" />
      </VBtn>
      <h1 v-if="title" class="auth-card__title">{{ title }}</h1>
    </div>

    <div class="auth-card__viewport" :style="{ height: viewportHeight }">
      <!-- Reuses the app's one shared route-transition (packages/brand/transitions.css,
           also driving AppLayout's/PublicLayout's RouterView) instead of a bespoke
           animation, so switching steps here feels like the same native motion as
           navigating anywhere else in the app. -->
      <Transition name="view-fade-lift" mode="out-in">
        <div :key="stepKey" class="auth-card__step" :ref="setStepRef">
          <slot />
        </div>
      </Transition>
    </div>
  </AnimatedCard>
</template>

<script setup lang="ts">
import { ref, onBeforeUnmount } from "vue";
import { useI18n } from "vue-i18n";
import AnimatedCard from "./AnimatedCard.vue";

const { backTo = null, title = null, loading = false, stepKey } = defineProps<{
  /** Route path for the back arrow, rendered inside the card's top-left corner. Omit to hide it. */
  backTo?: string | null;
  /** Step title, rendered in the same row as the back arrow (not inside the slot) so the two are
   * always vertically aligned instead of the title sitting wherever the step body happens to put it. */
  title?: string | null;
  /** Drives the card's native (Vuetify) border loader — one loading treatment, shared by every step. */
  loading?: boolean;
  /** Changing this key crossfades the slot content and animates the card to the new content's height. */
  stepKey: string | number;
}>();

const { t } = useI18n();

const animatedCardRef = ref<{ playExit: () => Promise<void> } | null>(null);
const viewportHeight = ref("auto");

// Keeps the card's height in sync with whichever step is currently mounted —
// covers both step changes (new element observed) and in-step content growth
// (e.g. a validation message appearing), without any manual measuring calls.
let resizeObserver: ResizeObserver | null = null;

function setStepRef(el: Element | null) {
  resizeObserver?.disconnect();
  resizeObserver = null;
  if (!el) return;
  resizeObserver = new ResizeObserver((entries) => {
    const height = entries[0]?.contentRect.height;
    if (height) viewportHeight.value = `${Math.ceil(height)}px`;
  });
  resizeObserver.observe(el);
}

onBeforeUnmount(() => resizeObserver?.disconnect());

defineExpose({
  playExit: () => animatedCardRef.value?.playExit(),
});
</script>

<style scoped>
.auth-card {
  position: relative;
}

/* Flex row, full card width, in normal flow above the step content — not
   absolutely positioned, so it never overlaps the text below it. Back arrow
   and title share this one row (align-items: center) so they're always at
   the same height, instead of the title living inside the step body below. */
.auth-card__back-row {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  padding: 8px 12px 0;
}

.auth-card__title {
  font-size: 1.375rem;
  font-weight: 600;
  letter-spacing: -0.25px;
  line-height: 1.3;
  margin: 0;
}

/* Same 280ms/easing as view-fade-lift (packages/brand/transitions.css), so
   the card's height settles in lockstep with the content fading/lifting
   through it — one motion, not two animations racing each other. */
.auth-card__viewport {
  position: relative;
  overflow: hidden;
  transition: height 280ms cubic-bezier(0.22, 1, 0.36, 1);
}

@media (prefers-reduced-motion: reduce) {
  .auth-card__viewport {
    transition: none;
  }
}
</style>
