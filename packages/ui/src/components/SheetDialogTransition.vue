<template>
  <Transition :css="false" @enter="onEnter" @leave="onLeave">
    <slot />
  </Transition>
</template>

<script setup lang="ts">
import { animate } from "motion";
import { useMotionPreferenceStore } from "@stores";

// Phone form dialogs as an M3 bottom sheet (NEO-85): the overlay content
// slides up from below the screen edge and settles (emphasized decelerate),
// and leaves faster than it came (emphasized accelerate) — things leaving
// shouldn't hold the user up. Passed via VDialog's `transition` prop as
// `sheetDialogTransition` from the sibling module.
const ENTER = { duration: 0.36, ease: [0.05, 0.7, 0.1, 1] } as const;
const LEAVE = { duration: 0.2, ease: [0.3, 0, 0.8, 0.15] } as const;

const motionPreference = useMotionPreferenceStore();

function onEnter(el: Element, done: () => void): void {
  const htmlEl = el as HTMLElement;
  if (motionPreference.shouldReduceMotion) {
    htmlEl.style.opacity = "1";
    done();
    return;
  }
  animate(htmlEl, { transform: ["translateY(100%)", "translateY(0)"] }, ENTER)
    .finished.then(done)
    .catch(done);
}

function onLeave(el: Element, done: () => void): void {
  if (motionPreference.shouldReduceMotion) {
    done();
    return;
  }
  animate(el as HTMLElement, { transform: ["translateY(0)", "translateY(100%)"] }, LEAVE)
    .finished.then(done)
    .catch(done);
}
</script>
