<!-- Silent looping video that only loads when its section is near.
     Lite mode (weak device/connection): the poster stays and a play button loads the video on demand. -->
<template>
  <div ref="root" class="loop" :class="{ playing }">
    <picture class="loop__poster">
      <source :srcset="poster.avif" type="image/avif" />
      <img :src="poster.jpg" :alt="label" loading="lazy" decoding="async" />
    </picture>
    <video
      v-if="shouldLoad"
      ref="video"
      class="loop__video"
      :src="src"
      muted
      loop
      playsinline
      preload="none"
      :aria-label="label"
      @playing="playing = true"
    />
    <button v-if="lite && !shouldLoad" type="button" class="loop__play" :aria-label="playLabel" @click="userStarted = true">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useInView } from "../lib/useInView";
import type { PictureSources } from "../lib/media";

const props = defineProps<{
  src: string;
  poster: PictureSources;
  label: string;
  playLabel: string;
  lite: boolean;
}>();

const root = ref<HTMLElement | null>(null);
const video = ref<HTMLVideoElement | null>(null);
const near = useInView(root);
const userStarted = ref(false);
const playing = ref(false);

const shouldLoad = computed(() => (props.lite ? userStarted.value : near.value));

watch(shouldLoad, async (load) => {
  if (!load) return;
  await nextTick();
  // play() returns undefined instead of a Promise in older engines (and jsdom).
  video.value?.play()?.catch(() => {
    // benign: autoplay refused (low-power mode) — the poster stays visible
  });
});

defineExpose({ video });
</script>

<style scoped>
.loop {
  position: relative;
  overflow: hidden;
  background: var(--ajm-ink);
}
.loop__poster img,
.loop__video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.loop__video {
  position: absolute;
  inset: 0;
  opacity: 0;
  transition: opacity 0.6s ease;
}
.loop.playing .loop__video {
  opacity: 1;
}
.loop__play {
  position: absolute;
  inset: 28% auto auto 50%;
  translate: -50% -50%;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  border: 1px solid rgba(244, 241, 234, 0.7);
  background: rgba(29, 28, 26, 0.45);
  color: var(--ajm-paper);
  display: grid;
  place-items: center;
  cursor: pointer;
}
.loop__play svg {
  width: 26px;
  height: 26px;
}
</style>
