<!-- Case 01 · Universal: the only material is one vertical phone walk-through, so the case IS the walk.
     Desktop: the video stands in a tall frame and the room names roll beside it in step with the footage.
     Phone: the vertical video fills the width, the natural format for it. -->
<template>
  <article id="universal" ref="root" class="case" :class="{ 'is-in': seen }">
    <header class="case__head">
      <p class="eyebrow">{{ t("universal.number") }} · {{ t("universal.client") }}</p>
      <h3 class="case__title">
        <span class="mask-line"><span>{{ t("universal.title") }}</span></span>
      </h3>
      <p class="case__tags">{{ t("universal.tags") }}</p>
    </header>

    <div class="walk">
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
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import LoopVideo from "./LoopVideo.vue";
import { loopUrl, picture } from "../lib/media";
import { useInView } from "../lib/useInView";

defineProps<{ lite: boolean }>();
const { t, tm, rt } = useI18n();
const root = ref<HTMLElement | null>(null);
const seen = useInView(root, "-10%");

// vue-i18n types message arrays loosely; each entry is a compiled message resolved by rt().
const rooms = computed(() => (tm("universal.rooms") as unknown[]).map((r) => rt(r as Parameters<typeof rt>[0])));

// The 18 s loop walks lounge → collection → meeting room; split it into equal thirds.
const loop = ref<InstanceType<typeof LoopVideo> | null>(null);
const currentTime = ref(0);
const roomIndex = computed(() => Math.min(rooms.value.length - 1, Math.floor(currentTime.value / 6)));

function onTime(e: Event) {
  currentTime.value = (e.target as HTMLVideoElement).currentTime;
}
let bound: HTMLVideoElement | null = null;
watch(
  () => loop.value?.video ?? null,
  (v) => {
    bound?.removeEventListener("timeupdate", onTime);
    bound = v;
    bound?.addEventListener("timeupdate", onTime);
  },
);
onBeforeUnmount(() => bound?.removeEventListener("timeupdate", onTime));
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
  margin: 12px 0;
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
  color: #cfc9bd;
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
