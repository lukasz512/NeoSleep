<!-- Full-screen photo viewer (Łukasz, 2026-09-28: photos should open larger, with a short
     description). Arrows / swipe-free buttons, ← → and Esc on the keyboard, a click on the dark
     backdrop closes it. Focus moves into the dialog and back to the photo that opened it. -->
<template>
  <Teleport to="body">
    <Transition name="lb">
      <div
        v-if="index !== null && current"
        ref="dialog"
        class="lb"
        role="dialog"
        aria-modal="true"
        :aria-label="current.caption"
        tabindex="-1"
        @click.self="close"
        @keydown.esc="close"
        @keydown.left="step(-1)"
        @keydown.right="step(1)"
      >
        <figure class="lb__figure">
          <picture :key="current.src.jpg" class="lb__pic">
            <source :srcset="current.src.avif" type="image/avif" />
            <img :src="current.src.jpg" :alt="current.caption" />
          </picture>
          <figcaption class="lb__cap">
            <span class="lb__title">{{ current.title }}</span>
            <span class="lb__meta">{{ current.caption }}</span>
            <span class="lb__count">{{ (index ?? 0) + 1 }} / {{ photos.length }}</span>
          </figcaption>
        </figure>
        <button v-if="photos.length > 1" type="button" class="lb__nav lb__nav--prev" :aria-label="labels.prev" @click="step(-1)">←</button>
        <button v-if="photos.length > 1" type="button" class="lb__nav lb__nav--next" :aria-label="labels.next" @click="step(1)">→</button>
        <button type="button" class="lb__close" :aria-label="labels.close" @click="close">×</button>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import type { PictureSources } from "../lib/media";

export interface LightboxPhoto {
  src: PictureSources;
  title: string;
  caption: string;
}

const props = defineProps<{ photos: LightboxPhoto[]; labels: { prev: string; next: string; close: string } }>();
const index = defineModel<number | null>("index", { default: null });
const dialog = ref<HTMLElement | null>(null);
let opener: Element | null = null;

const current = computed(() => (index.value === null ? null : props.photos[index.value] ?? null));

function step(d: number) {
  if (index.value === null || props.photos.length === 0) return;
  index.value = (index.value + d + props.photos.length) % props.photos.length;
}
function close() {
  index.value = null;
}

watch(index, async (i, prev) => {
  if (i !== null && prev === null) {
    opener = document.activeElement;
    document.documentElement.style.overflow = "hidden";
    await nextTick();
    dialog.value?.focus();
  }
  if (i === null && prev !== null) {
    document.documentElement.style.overflow = "";
    (opener as HTMLElement | null)?.focus?.();
  }
});
</script>

<style scoped>
.lb {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
  padding: clamp(16px, 5vw, 64px);
  background: rgba(14, 13, 12, 0.92);
  color: var(--ajm-on-stage);
  outline: none;
}
.lb__figure {
  margin: 0;
  display: grid;
  gap: 14px;
  max-width: min(1200px, 100%);
}
.lb__pic img {
  max-height: 76svh;
  width: auto;
  max-width: 100%;
  margin: 0 auto;
  object-fit: contain;
  animation: lb-in 0.5s var(--ajm-ease);
}
.lb__cap {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 16px;
}
.lb__title {
  font: 500 18px var(--ajm-font);
}
.lb__meta {
  font-size: 14px;
  color: rgba(244, 241, 234, 0.7);
}
.lb__count {
  margin-left: auto;
  font: 500 11px var(--ajm-font);
  letter-spacing: 0.16em;
  color: rgba(244, 241, 234, 0.55);
}
.lb__nav,
.lb__close {
  position: absolute;
  width: 48px;
  height: 48px;
  border: 1px solid rgba(244, 241, 234, 0.3);
  border-radius: 50%;
  background: rgba(14, 13, 12, 0.4);
  color: inherit;
  font-size: 20px;
  cursor: pointer;
  transition: background-color 0.3s ease;
}
.lb__nav:hover,
.lb__close:hover {
  background: rgba(244, 241, 234, 0.12);
}
.lb__nav--prev {
  left: clamp(8px, 2vw, 24px);
  top: 50%;
}
.lb__nav--next {
  right: clamp(8px, 2vw, 24px);
  top: 50%;
}
.lb__close {
  top: calc(12px + env(safe-area-inset-top));
  right: clamp(8px, 2vw, 24px);
}
.lb-enter-active,
.lb-leave-active {
  transition: opacity 0.35s ease;
}
.lb-enter-from,
.lb-leave-to {
  opacity: 0;
}
@keyframes lb-in {
  from {
    opacity: 0;
    transform: scale(0.97);
  }
}
</style>
