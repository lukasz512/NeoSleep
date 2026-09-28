<!-- Case 01 · Universal: the only material is one vertical phone walk-through, so the case IS the walk.
     Desktop: the video stands in a tall frame and the room names roll beside it in step with the footage.
     Phone: the vertical video fills the width, the natural format for it. -->
<template>
  <article id="universal" ref="root" class="case" :class="{ 'is-in': seen }">
    <header class="case__head">
      <p class="eyebrow">{{ t("universal.number") }} · {{ t("universal.client") }}</p>
      <h3 class="case__title">
        <span class="mask-line"><span><AccentText :text="t('universal.title')" :stroke="0" /></span></span>
      </h3>
      <p class="case__tags">{{ t("universal.tags") }}</p>
    </header>

    <div ref="walk" class="walk">
      <div class="walk__frame">
        <LoopVideo
          ref="loop"
          class="walk__video"
          :src="loopUrl('universal/walk', lite)"
          :poster="picture('universal/lounge')"
          :label="t('universal.videoLabel')"
          :play-label="t('media.play')"
          :lite="lite"
        />
      </div>
      <div class="walk__side">
        <p class="walk__body">{{ t("universal.body") }}</p>
        <ol class="walk__rooms">
          <li v-for="(room, i) in rooms" :key="room" :class="{ on: i === roomIndex }">
            <span class="walk__num">{{ String(i + 1).padStart(2, "0") }}</span>{{ room }}
          </li>
        </ol>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import AccentText from "./AccentText.vue";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import LoopVideo from "./LoopVideo.vue";
import { loopUrl, picture } from "../lib/media";
import { useInView } from "../lib/useInView";
import { span01, useScrollProgress } from "../lib/motion";

defineProps<{ lite: boolean }>();
const { t, tm, rt } = useI18n();
const root = ref<HTMLElement | null>(null);
const seen = useInView(root, "-10%");

// vue-i18n types message arrays loosely; each entry is a compiled message resolved by rt().
const rooms = computed(() => (tm("universal.rooms") as unknown[]).map((r) => rt(r as Parameters<typeof rt>[0])));

// Scroll picks the room (Łukasz, 2026-09-28): as the walk-through rises up the screen the list
// steps lounge → collection → meeting room, and the video stays inside that room's third of the
// 18 s loop (0–6 s, 6–12 s, 12–18 s), so picture and name always match. Lite: static list.
const walk = ref<HTMLElement | null>(null);
const entering = useScrollProgress(walk, "enter");
const roomIndex = computed(() =>
  Math.min(rooms.value.length - 1, Math.floor(span01(entering.value, 0.3, 0.95) * rooms.value.length)),
);
const SEGMENT = 6;

const loop = ref<InstanceType<typeof LoopVideo> | null>(null);
function keepInRoom(e: Event) {
  const v = e.target as HTMLVideoElement;
  const start = roomIndex.value * SEGMENT;
  if (v.currentTime < start || v.currentTime >= start + SEGMENT) v.currentTime = start;
}
watch(roomIndex, (i) => {
  const v = loop.value?.video;
  if (v && v.readyState > 0) v.currentTime = i * SEGMENT;
});
let bound: HTMLVideoElement | null = null;
watch(
  () => loop.value?.video ?? null,
  (v) => {
    bound?.removeEventListener("timeupdate", keepInRoom);
    bound = v;
    bound?.addEventListener("timeupdate", keepInRoom);
  },
);
onBeforeUnmount(() => bound?.removeEventListener("timeupdate", keepInRoom));
</script>

<style scoped>
.case {
  padding: clamp(72px, 10vw, 140px) var(--ajm-gutter);
  border-top: 1px solid var(--ajm-line);
}
.case__head {
  max-width: 900px;
  margin-bottom: clamp(32px, 5vw, 64px);
}
.case__title {
  margin: 12px 0 0.5em;
  font: 500 clamp(32px, 5vw, 72px) / 1 var(--ajm-font);
  letter-spacing: -0.02em;
}
.case__tags {
  margin: 0;
  color: var(--ajm-muted);
  font-size: 14px;
  letter-spacing: 0.04em;
}
.walk {
  display: grid;
  grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
  gap: clamp(32px, 6vw, 96px);
  align-items: center;
}
.walk__frame {
  aspect-ratio: 9 / 16;
  max-height: 84svh;
  justify-self: center;
  width: 100%;
  max-width: 460px;
  border-radius: 4px;
  overflow: hidden;
  clip-path: inset(100% 0 0 0);
  transition: clip-path 1.1s var(--ajm-ease);
}
.is-in .walk__frame {
  clip-path: inset(0 0 0 0);
}
.walk__video,
.walk__video :deep(img),
.walk__video :deep(video) {
  height: 100%;
}
.walk__body {
  font-size: clamp(17px, 1.5vw, 21px);
  color: var(--ajm-ink-soft);
  margin: 0 0 40px;
  max-width: 520px;
}
.walk__rooms {
  list-style: none;
  margin: 0;
  padding: 0;
  font: 500 clamp(26px, 3.4vw, 48px) / 1.25 var(--ajm-font);
  letter-spacing: -0.015em;
}
.walk__rooms li {
  color: var(--ajm-faint);
  transition: color 0.5s ease;
}
.walk__rooms li.on {
  color: var(--ajm-ink);
}
.walk__num {
  font: 500 12px var(--ajm-font);
  letter-spacing: 0.14em;
  color: var(--ajm-muted);
  margin-right: 16px;
  vertical-align: middle;
}
@media (max-width: 760px) {
  .walk {
    grid-template-columns: 1fr;
  }
  .walk__frame {
    max-height: none;
  }
}
</style>
