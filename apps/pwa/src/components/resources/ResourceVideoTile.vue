<template>
  <div
    class="video-card"
    :class="{ 'video-card--pressing': pressing, 'video-card--row': layout === 'row' }"
    role="button"
    tabindex="0"
    :aria-label="t('user.resources.video.play', { title: video.title })"
    data-testid="resource-video-tile"
    @click="open"
    @keydown.enter.prevent="open"
    @keydown.space.prevent="open"
    @animationend="pressing = false"
  >
    <div class="video-card__thumb" :data-state="posterState">
      <img
        v-if="video.posterUrl && posterState !== 'error'"
        class="video-card__image"
        :src="video.posterUrl"
        alt=""
        loading="lazy"
        decoding="async"
        @load="posterState = 'ready'"
        @error="posterState = 'error'"
      />
      <span v-if="video.durationSec" class="video-card__duration">{{ formatDuration(video.durationSec) }}</span>
      <span class="video-card__drop" aria-hidden="true"><AppIcon name="play" /></span>
    </div>
    <span class="video-card__body">
      <span class="video-card__title">{{ video.title }}</span>
      <span class="video-card__meta">
        <span class="video-card__author">{{ video.description }}</span>
        <span class="video-card__langs">
          <span v-for="lang in video.languages" :key="lang.code" class="video-card__lang" :title="languageName(lang.code, locale)">
            <PartnerLanguageFlag :code="lang.code" />
            {{ lang.code.toUpperCase() }}
          </span>
        </span>
      </span>
    </span>
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
 * One video as a small card (NEO-151, variant B): a 16:9 frame with its length,
 * the title under it in normal ink, then author and language flags. It behaves
 * like the rest of the app, not like a streaming site — no lift, no shadow,
 * a quiet tint on hover. The play button drops in like water (grows,
 * overshoots, settles) and a press swells the frame under the finger, the same
 * "drop" the phone avatar and page transitions use. `layout="row"` lays the
 * same card flat for the Resources list view (desktop/tablet toggle, NEO-151).
 */
const props = withDefaults(defineProps<{ video: PartnerResourceItem; layout?: "card" | "row" }>(), { layout: "card" });
const emit = defineEmits<{ open: [] }>();
const { t, locale } = useI18n();

const posterState = ref<"loading" | "ready" | "error">(props.video.posterUrl ? "loading" : "error");
watch(
  () => props.video.posterUrl,
  (url) => (posterState.value = url ? "loading" : "error")
);

const pressing = ref(false);
function open(): void {
  pressing.value = false;
  requestAnimationFrame(() => (pressing.value = true));
  emit("open");
}
</script>

<style scoped>
.video-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  padding: 6px;
  margin: -6px;
  border-radius: 14px;
  cursor: pointer;
  outline: none;
  color: inherit;
  transition: background 0.2s ease;
}
.video-card:hover {
  background: rgba(var(--v-theme-primary), 0.06);
}
.video-card:focus-visible .video-card__thumb {
  box-shadow: 0 0 0 2px rgb(var(--v-theme-primary));
}

.video-card__thumb {
  position: relative;
  aspect-ratio: 16 / 9;
  border-radius: 10px;
  overflow: hidden;
  background: rgb(var(--v-theme-surface-container-high));
}
/* Waiting for the frame: a quiet shimmer; no frame at all: the plain tone. */
.video-card__thumb[data-state="loading"]::before {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(100deg, transparent 30%, rgba(var(--v-theme-on-surface), 0.06) 50%, transparent 70%);
  background-size: 220% 100%;
  animation: video-card-shimmer 1.4s linear infinite;
}
@keyframes video-card-shimmer {
  from {
    background-position: 120% 0;
  }
  to {
    background-position: -120% 0;
  }
}
.video-card__image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0;
  transition: opacity 0.35s ease;
}
.video-card__thumb[data-state="ready"] .video-card__image {
  opacity: 1;
}

.video-card__duration {
  position: absolute;
  right: 6px;
  bottom: 6px;
  padding: 3px 5px;
  border-radius: 5px;
  background: rgba(16, 22, 21, 0.72);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

/* The drop: hidden until hover/focus, then grows, overshoots and settles. */
.video-card__drop {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 38px;
  height: 38px;
  margin: -19px 0 0 -19px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.94);
  color: rgb(var(--v-theme-primary));
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.18);
  opacity: 0;
  transform: scale(0);
}
.video-card__drop .app-icon {
  width: 14px;
  height: 14px;
  margin-left: 2px;
}
.video-card:hover .video-card__drop,
.video-card:focus-visible .video-card__drop {
  animation: video-card-drop 0.52s cubic-bezier(0.37, 0, 0.23, 1) forwards;
}
@keyframes video-card-drop {
  0% {
    opacity: 0;
    transform: scale(0);
  }
  45% {
    opacity: 1;
    transform: scale(1.18);
  }
  72% {
    transform: scale(0.94);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}
/* Touch has no hover: the drop just sits there. */
@media (hover: none) {
  .video-card__drop {
    opacity: 1;
    transform: scale(1);
  }
}
.video-card--pressing .video-card__thumb {
  animation: video-card-press 0.42s cubic-bezier(0.37, 0, 0.23, 1);
}
@keyframes video-card-press {
  0% {
    transform: scale(1);
  }
  35% {
    transform: scale(1.05);
  }
  70% {
    transform: scale(0.985);
  }
  100% {
    transform: scale(1);
  }
}

.video-card__body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.video-card__title {
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.3;
  min-height: 2.6em;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.video-card__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.video-card__author {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.video-card__langs {
  display: inline-flex;
  flex-shrink: 0;
  gap: 6px;
}
.video-card__lang {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-weight: 600;
}

/* Row: the list view — frame on the left, text beside it, like the app's other lists. */
.video-card--row {
  position: relative;
  flex-direction: row;
  align-items: center;
  gap: 16px;
  padding: 10px;
  margin: 0 -10px;
  border-radius: 12px;
}
.video-card--row::after {
  content: "";
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: 0;
  height: 1px;
  background: rgba(var(--v-theme-on-surface), 0.08);
}
.video-card--row:hover::after {
  opacity: 0;
}
.video-card--row .video-card__thumb {
  flex: none;
  width: 144px;
}
.video-card--row .video-card__body {
  flex: 1;
  gap: 4px;
}
.video-card--row .video-card__title {
  min-height: 0;
  font-size: 0.9375rem;
}

@media (prefers-reduced-motion: reduce) {
  .video-card__thumb[data-state="loading"]::before,
  .video-card--pressing .video-card__thumb {
    animation: none;
  }
  .video-card:hover .video-card__drop,
  .video-card:focus-visible .video-card__drop {
    animation: none;
    opacity: 1;
    transform: scale(1);
  }
}
</style>
