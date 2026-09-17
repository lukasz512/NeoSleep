<template>
  <div class="auth-loading-orbs" aria-hidden="true">
    <div class="auth-loading-orbs__frame">
      <span
        class="auth-loading-orbs__orb auth-loading-orbs__orb--big"
        :class="{ 'auth-loading-orbs__orb--static': motionPreference.shouldReduceMotion }"
      />
      <span
        class="auth-loading-orbs__orb auth-loading-orbs__orb--medium"
        :class="{ 'auth-loading-orbs__orb--static': motionPreference.shouldReduceMotion }"
      />
      <span
        class="auth-loading-orbs__orb auth-loading-orbs__orb--small"
        :class="{ 'auth-loading-orbs__orb--static': motionPreference.shouldReduceMotion }"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
// Pre-navigation loading indicator for PublicLayout (see initialNavPending
// there, gated on router.isReady()) — shown while the router's first
// navigation is still resolving, before AuthView has mounted and can show its
// own decorative orbs (see .auth-view__orb* there). Deliberately simpler than
// AuthView's: no pop-in choreography, no useMagneticPointer, just the same
// gentle pulse timing/opacity range so the handoff into AuthView's real orbs
// reads as continuous rather than a swap between two different animations.
import { useMotionPreferenceStore } from "@stores";

const motionPreference = useMotionPreferenceStore();
</script>

<style scoped>
.auth-loading-orbs {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.auth-loading-orbs__frame {
  position: relative;
  width: min(70vw, 260px);
  aspect-ratio: 1;
}

.auth-loading-orbs__orb {
  position: absolute;
  aspect-ratio: 1;
  border-radius: 50%;
  background: rgb(var(--v-theme-primary));
  animation: auth-loading-orbs-pulse 8s ease-in-out infinite alternate;
  will-change: opacity;
}

.auth-loading-orbs__orb--big {
  width: 70%;
  top: 18%;
  left: 32%;
  opacity: 0.42;
}

.auth-loading-orbs__orb--medium {
  width: 46%;
  bottom: 8%;
  left: 0;
  background: color-mix(in srgb, rgb(var(--v-theme-primary)) 55%, white 45%);
  opacity: 0.5;
  animation-delay: -1.5s;
}

.auth-loading-orbs__orb--small {
  width: 56%;
  top: 0;
  right: 0;
  opacity: 0.55;
  animation-delay: -3s;
}

/* Same range as AuthView's auth-view-orb-pulse — kept as a separate,
   duplicated keyframe (not imported) since this component has no card-slot
   dependency and must work standalone, before AuthView exists in the DOM. */
@keyframes auth-loading-orbs-pulse {
  0% {
    opacity: 0.34;
  }
  100% {
    opacity: 0.68;
  }
}

.auth-loading-orbs__orb--static {
  animation: none;
  opacity: 0.5;
}
</style>
