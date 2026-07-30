<template>
  <Transition :css="false" @enter="onEnter" @leave="onLeave">
    <slot />
  </Transition>
</template>

<script setup lang="ts">
import { animate } from "motion";
import { useMotionPreferenceStore } from "@stores";
import { getDialogOrigin } from "../composables/useDialogOrigin";

// Drives VDialog's overlay content in/out with spring physics, scaling from
// the point the user clicked to open it (native-iOS-style presentation)
// instead of Vuetify's default fade/slide. Passed via VDialog's `transition`
// prop as `{ component: OriginDialogTransition }` — see originDialogTransition
// in the sibling module for the ready-to-use constant.
const SPRING = { type: "spring", stiffness: 500, damping: 34, mass: 0.9 } as const;

const motionPreference = useMotionPreferenceStore();

function applyOrigin(el: HTMLElement): void {
  const [x, y] = getDialogOrigin();
  const rect = el.getBoundingClientRect();
  el.style.transformOrigin = `${x - rect.left}px ${y - rect.top}px`;
}

function onEnter(el: Element, done: () => void): void {
  const htmlEl = el as HTMLElement;
  applyOrigin(htmlEl);

  if (motionPreference.shouldReduceMotion) {
    htmlEl.style.opacity = "1";
    done();
    return;
  }
  animate(htmlEl, { opacity: [0, 1], transform: ["scale(0.4)", "scale(1)"] }, SPRING)
    .finished.then(done)
    .catch(done);
}

function onLeave(el: Element, done: () => void): void {
  const htmlEl = el as HTMLElement;

  if (motionPreference.shouldReduceMotion) {
    done();
    return;
  }
  animate(htmlEl, { opacity: [1, 0], transform: ["scale(1)", "scale(0.96)"] }, SPRING)
    .finished.then(done)
    .catch(done);
}
</script>
