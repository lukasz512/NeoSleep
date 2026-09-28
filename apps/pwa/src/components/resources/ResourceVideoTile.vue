<template>
  <div
    class="video-tile"
    role="button"
    tabindex="0"
    :style="{ '--i': index }"
    :aria-label="t('user.resources.video.play', { title: video.title })"
    data-testid="resource-video-tile"
    @click="emit('open')"
    @keydown.enter.prevent="emit('open')"
    @keydown.space.prevent="emit('open')"
  >
    <div class="video-tile__poster" :data-state="posterState">
      <img
        v-if="video.posterUrl && posterState !== 'error'"
        class="video-tile__image"
        :src="video.posterUrl"
        alt=""
        loading="lazy"
        decoding="async"
        @load="posterState = 'ready'"
        @error="posterState = 'error'"
      />
      <!-- Shown while the poster loads (shimmer) and for good when there is none. -->
      <div class="video-tile__cover" aria-hidden="true" />

      <div class="video-tile__langs">
        <span v-for="lang in video.languages" :key="lang.code" class="video-tile__lang" :title="languageName(lang.code, locale)">
          <PartnerLanguageFlag :code="lang.code" />
          {{ lang.code.toUpperCase() }}
        </span>
      </div>
      <span v-if="video.durationSec" class="video-tile__duration">{{ formatDuration(video.durationSec) }}</span>

      <span class="video-tile__play" aria-hidden="true"><AppIcon name="play" /></span>

      <div class="video-tile__caption">
        <span class="video-tile__title">{{ video.title }}</span>
        <span v-if="video.description" class="video-tile__subtitle">{{ video.description }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import AppIcon from "../AppIcon.vue";
import PartnerLanguageFlag from "./PartnerLanguageFlag.vue";
import { formatDuration, languageName } from "./videoFormat";
import type { PartnerResourceItem } from "../../composables/usePartnerResources";

/**
 * One webinar as a tile (NEO-151, option 2): the poster is the tile, title and
 * flags sit on it, a click opens ResourceVideoSheet. No player here — the
 * grid never starts a download, so it stays calm however slow the videos are.
 */
const props = defineProps<{ video: PartnerResourceItem; index: number }>();
const emit = defineEmits<{ open: [] }>();
const { t, locale } = useI18n();

const posterState = ref<"loading" | "ready" | "error">(props.video.posterUrl ? "loading" : "error");
watch(
  () => props.video.posterUrl,
  (url) => (posterState.value = url ? "loading" : "error")
);
</script>

<style scoped>
.video-tile {
  cursor: pointer;
  outline: none;
  border-radius: 16px;
  animation: video-tile-in 0.45s cubic-bezier(0.2, 0.7, 0.2, 1) both;
  animation-delay: calc(min(var(--i), 11) * 50ms);
}
@keyframes video-tile-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
}

.video-tile__poster {
  position: relative;
  aspect-ratio: 4 / 3;
  border-radius: 16px;
  overflow: hidden;
  isolation: isolate;
  background: rgb(var(--v-theme-surface-container-high));
  transition: box-shadow 0.25s ease, transform 0.25s ease;
}
.video-tile:hover .video-tile__poster {
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.28);
  transform: translateY(-2px);
}
.video-tile:focus-visible .video-tile__poster {
  box-shadow: 0 0 0 3px rgb(var(--v-theme-primary));
}

.video-tile__image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0;
  transition: opacity 0.4s ease, transform 6s ease-out;
}
.video-tile__poster[data-state="ready"] .video-tile__image {
  opacity: 1;
}
.video-tile:hover .video-tile__image {
  transform: scale(1.05);
}

/* Brand-tinted cover: a shimmer while the poster loads, the permanent face of a video without one. */
.video-tile__cover {
  position: absolute;
  inset: 0;
  z-index: -1;
  background:
    radial-gradient(120% 90% at 15% 20%, rgba(var(--v-theme-primary), 0.55), transparent 60%),
    linear-gradient(160deg, rgb(var(--v-theme-surface-container-high)), rgb(var(--v-theme-surface-container-low)));
}
.video-tile__poster[data-state="loading"] .video-tile__cover::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(100deg, transparent 30%, rgba(255, 255, 255, 0.12) 50%, transparent 70%);
  background-size: 220% 100%;
  animation: video-tile-shimmer 1.4s linear infinite;
}
@keyframes video-tile-shimmer {
  from {
    background-position: 120% 0;
  }
  to {
    background-position: -120% 0;
  }
}

/* Readable white text on any frame. */
.video-tile__poster::after {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.35) 0%, rgba(0, 0, 0, 0) 28%, rgba(0, 0, 0, 0) 40%, rgba(0, 0, 0, 0.85) 100%);
}

.video-tile__langs,
.video-tile__duration,
.video-tile__play,
.video-tile__caption {
  position: absolute;
  z-index: 2;
}

.video-tile__langs {
  top: 10px;
  left: 10px;
  right: 72px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.video-tile__lang,
.video-tile__duration {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 8px 4px 5px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(6px);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0.02em;
}
.video-tile__duration {
  top: 10px;
  right: 10px;
  padding: 4px 8px;
  border-radius: 6px;
  font-variant-numeric: tabular-nums;
}

.video-tile__play {
  top: 42%;
  left: 50%;
  width: 52px;
  height: 52px;
  margin: -26px 0 0 -26px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(8px);
  color: #fff;
  transition: transform 0.25s ease, background 0.25s ease;
}
.video-tile__play .app-icon {
  width: 22px;
  height: 22px;
  margin-left: 3px;
}
.video-tile:hover .video-tile__play,
.video-tile:focus-visible .video-tile__play {
  transform: scale(1.1);
  background: rgb(var(--v-theme-primary));
}

.video-tile__caption {
  left: 14px;
  right: 14px;
  bottom: 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  color: #fff;
}
.video-tile__title {
  font-size: 15px;
  font-weight: 650;
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.video-tile__subtitle {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.75);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

@media (prefers-reduced-motion: reduce) {
  .video-tile,
  .video-tile__image,
  .video-tile__poster,
  .video-tile__cover::after {
    animation: none;
    transition: none;
  }
}
</style>
