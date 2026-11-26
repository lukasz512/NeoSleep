<template>
  <div class="app-state-view" role="status" aria-live="polite">
    <div class="app-state-view__icon">
      <slot name="icon" />
    </div>
    <p class="app-state-view__title">{{ title }}</p>
    <p v-if="subtitle" class="app-state-view__subtitle">{{ subtitle }}</p>
    <div v-if="$slots.cta" class="app-state-view__cta">
      <slot name="cta" />
    </div>
  </div>
</template>

<script setup lang="ts">
// Shared shell for full-page "nothing to show" states — not found, load
// error, empty list — driven entirely by the icon/cta slots and title/
// subtitle props a caller passes in, so every one of those screens gets the
// same entrance choreography (icon draws in, text reveals line by line) for
// free instead of hand-building it per screen. Icon/CTA are slots, not props,
// so this package never needs to know about a consuming app's own icon set
// or button component — see AppEmptyState.vue / AppErrorState.vue /
// ItemDetailLayout.vue in apps/pwa for how they wire AppIcon/AppButton in.
//
// A decorative orb background (blurred primary-tinted blobs drifting toward
// the pointer, via useMagneticPointer — see AuthView's login orbs) was tried
// here and pulled per feedback: too visible/green even at low opacity behind
// a small in-page panel. Revisit with a much lighter treatment if wanted.
defineProps<{
  title: string;
  subtitle?: string;
}>();
</script>

<style scoped>
.app-state-view {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 24px;
  text-align: center;
}

.app-state-view__icon {
  width: clamp(96px, 10vw, 120px);
  height: clamp(96px, 10vw, 120px);
  margin-bottom: 20px;
  opacity: 0.55;
  color: rgb(var(--v-theme-on-surface));
  animation: app-state-view-icon-pop 480ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

.app-state-view__icon :deep(svg) {
  width: 100%;
  height: 100%;
  display: block;
}

/* Relies on pathLength="1" set on every shape in AppIcon.vue's icon
   registry — normalizes stroke-dasharray/dashoffset to a 0..1 space so this
   one fixed animation "draws" any icon regardless of its real path length. */
.app-state-view__icon :deep(svg *) {
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  animation: app-state-view-icon-draw 700ms ease-out 120ms forwards;
}

.app-state-view__title {
  margin: 0 0 8px;
  font-size: clamp(1.125rem, 2vw, 1.25rem);
  font-weight: 500;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  animation: app-state-view-fade-up 420ms ease-out 340ms both;
}

.app-state-view__subtitle {
  margin: 0 0 24px;
  font-size: 0.9375rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  max-width: 360px;
  animation: app-state-view-fade-up 420ms ease-out 460ms both;
}

.app-state-view__cta {
  animation: app-state-view-fade-up 420ms ease-out 580ms both;
}

@keyframes app-state-view-icon-pop {
  from {
    opacity: 0;
    transform: scale(0.6);
  }
  to {
    opacity: 0.55;
    transform: scale(1);
  }
}

@keyframes app-state-view-icon-draw {
  to {
    stroke-dashoffset: 0;
  }
}

@keyframes app-state-view-fade-up {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .app-state-view__icon,
  .app-state-view__icon :deep(svg *),
  .app-state-view__title,
  .app-state-view__subtitle,
  .app-state-view__cta {
    animation: none !important;
    opacity: 1 !important;
    transform: none !important;
    stroke-dashoffset: 0 !important;
  }

  .app-state-view__icon {
    opacity: 0.55 !important;
  }
}
</style>
