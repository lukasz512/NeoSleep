<template>
  <component
    :is="sheet ? VBottomSheet : VDialog"
    :model-value="video !== null"
    :max-width="sheet ? undefined : 760"
    class="video-sheet-overlay"
    :z-index="OVER_BOTTOM_NAV"
    @update:model-value="(open: boolean) => !open && emit('close')"
  >
    <div v-if="video" class="video-sheet" data-testid="resource-video-sheet">
      <div class="video-sheet__stage" :data-state="state">
        <img v-if="video.posterUrl" class="video-sheet__backdrop" :src="video.posterUrl" alt="" aria-hidden="true" />
        <video
          :key="src"
          ref="player"
          class="video-sheet__video"
          :src="src"
          :poster="video.posterUrl ?? undefined"
          controls
          autoplay
          playsinline
          preload="auto"
          @loadstart="onStart"
          @canplay="onReady"
          @playing="state = 'playing'"
          @waiting="state === 'playing' && (state = 'buffering')"
          @error="state = 'error'"
        />

        <Transition name="video-sheet-fade">
          <div v-if="state === 'loading'" class="video-sheet__overlay" data-testid="resource-video-loading" aria-live="polite">
            <div class="video-sheet__bars" aria-hidden="true"><i /><i /><i /><i /><i /></div>
            <VProgressLinear indeterminate color="primary" rounded class="video-sheet__progress" />
            <strong>{{ t("user.resources.video.preparing") }}</strong>
            <small>{{ slow ? t("user.resources.video.slow") : t("user.resources.video.largeFile") }}</small>
            <small class="video-sheet__elapsed">{{ t("user.resources.video.elapsed", { s: elapsed }) }}</small>
          </div>
          <div v-else-if="state === 'buffering'" class="video-sheet__overlay video-sheet__overlay--light" aria-live="polite">
            <VProgressCircular indeterminate color="primary" size="40" width="3" />
          </div>
          <div v-else-if="state === 'error'" class="video-sheet__overlay" data-testid="resource-video-error" role="alert">
            <AppIcon name="alert-circle" class="video-sheet__error-icon" />
            <strong>{{ t("user.resources.video.error") }}</strong>
            <small>{{ t("user.resources.video.errorHint") }}</small>
            <AppButton variant="flat" color="primary" @click="retry">{{ t("user.resources.video.retry") }}</AppButton>
          </div>
        </Transition>

        <AppButton
          icon
          variant="text"
          class="video-sheet__close"
          data-testid="resource-video-close"
          :title="t('app.common.close')"
          :aria-label="t('app.common.close')"
          @click="emit('close')"
        >
          <AppIcon name="close" />
        </AppButton>
      </div>

      <div class="video-sheet__info">
        <div class="video-sheet__text">
          <h2 class="video-sheet__title">{{ video.title }}</h2>
          <span class="video-sheet__meta">
            {{ [video.description, video.durationSec ? formatDuration(video.durationSec) : ""].filter(Boolean).join(" · ") }}
          </span>
        </div>
        <div v-if="video.languages.length > 1" class="video-sheet__langs" role="group" :aria-label="t('user.resources.video.language')">
          <button
            v-for="lang in video.languages"
            :key="lang.code"
            type="button"
            class="video-sheet__lang"
            :aria-pressed="lang.mediaUrl === src"
            :title="languageName(lang.code, locale)"
            @click="switchTo(lang.mediaUrl)"
          >
            <PartnerLanguageFlag :code="lang.code" />
            {{ lang.code.toUpperCase() }}
          </button>
        </div>
        <span v-else-if="video.languages[0]" class="video-sheet__lang video-sheet__lang--static" :title="languageName(video.languages[0].code, locale)">
          <PartnerLanguageFlag :code="video.languages[0].code" />
          {{ video.languages[0].code.toUpperCase() }}
        </span>
      </div>
    </div>
  </component>
</template>

<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from "vue";
import { useI18n } from "vue-i18n";
import { useDisplay } from "vuetify";
import { VBottomSheet } from "vuetify/components/VBottomSheet";
import { VDialog } from "vuetify/components/VDialog";
import AppButton from "../AppButton.vue";
import AppIcon from "../AppIcon.vue";
import PartnerLanguageFlag from "./PartnerLanguageFlag.vue";
import { formatDuration, languageName } from "./videoFormat";
import type { PartnerResourceItem } from "../../composables/usePartnerResources";

/**
 * The one place a webinar plays (NEO-151, option 2). Webinars are hundreds of
 * MB streamed through the API in 8 MiB slices, so the first frame can take
 * 10–20 s: the sheet says so honestly (elapsed seconds, not a made-up
 * percentage — the real size to buffer isn't known before the first frame).
 * Closing unmounts the <video>, which aborts its download, so only one video
 * ever loads at a time.
 */
const props = defineProps<{ video: PartnerResourceItem | null }>();
const emit = defineEmits<{ close: [] }>();
const { t, locale } = useI18n();
const { smAndDown } = useDisplay();
const sheet = smAndDown;
/** The phone bottom bar sits at 9998 (MobileBottomNavBar) — a full-width player must cover it, not hide under it. */
const OVER_BOTTOM_NAV = 10000;

type State = "loading" | "buffering" | "playing" | "error";
const state = ref<State>("loading");
const src = ref("");
const player = ref<HTMLVideoElement | null>(null);
const elapsed = ref(0);
const slow = ref(false);
/** After this long the copy switches from "usually 10–20 s" to "still loading, it's slow". */
const SLOW_AFTER_S = 25;
let timer: ReturnType<typeof setInterval> | undefined;

function stopTimer(): void {
  if (timer) clearInterval(timer);
  timer = undefined;
}

function onStart(): void {
  state.value = "loading";
  elapsed.value = 0;
  slow.value = false;
  stopTimer();
  timer = setInterval(() => {
    elapsed.value += 1;
    if (elapsed.value >= SLOW_AFTER_S) slow.value = true;
  }, 1000);
}

function onReady(): void {
  stopTimer();
  // Hide the overlay as soon as a frame can show — if autoplay was blocked, the player's own controls take over.
  if (state.value === "loading" || state.value === "buffering") state.value = "playing";
}

function switchTo(url: string): void {
  if (url === src.value) return;
  src.value = url;
}

function retry(): void {
  state.value = "loading";
  player.value?.load();
}

watch(
  () => props.video,
  (video) => {
    stopTimer();
    state.value = "loading";
    src.value = video ? (video.languages.find((l) => l.mediaUrl === video.mediaUrl)?.mediaUrl ?? video.mediaUrl) : "";
  },
  { immediate: true }
);

onBeforeUnmount(stopTimer);
</script>

<style scoped>
.video-sheet {
  background: rgb(var(--v-theme-surface));
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.45);
}
:global(.v-bottom-sheet) .video-sheet {
  border-radius: 20px 20px 0 0;
}
:global(.v-bottom-sheet) .video-sheet__info {
  padding-bottom: calc(20px + env(safe-area-inset-bottom, 0px));
}

.video-sheet__stage {
  position: relative;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  background: #000;
}
.video-sheet__backdrop {
  position: absolute;
  inset: -20px;
  width: calc(100% + 40px);
  height: calc(100% + 40px);
  object-fit: cover;
  filter: blur(18px) brightness(0.5);
  transition: opacity 0.4s ease;
}
.video-sheet__video {
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
  background: transparent;
  opacity: 0;
  transition: opacity 0.4s ease;
}
.video-sheet__stage[data-state="playing"] .video-sheet__video,
.video-sheet__stage[data-state="buffering"] .video-sheet__video {
  opacity: 1;
}
.video-sheet__stage[data-state="playing"] .video-sheet__backdrop {
  opacity: 0;
}

.video-sheet__overlay {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 16px;
  text-align: center;
  color: #fff;
}
.video-sheet__overlay small {
  color: rgba(255, 255, 255, 0.7);
  max-width: 36ch;
}
.video-sheet__overlay--light {
  pointer-events: none;
}
.video-sheet__elapsed {
  font-variant-numeric: tabular-nums;
}
.video-sheet__progress {
  width: min(280px, 70%);
  flex: none;
}
.video-sheet__error-icon {
  width: 32px;
  height: 32px;
  color: rgb(var(--v-theme-error));
}

/* A quiet "working" signal next to the bar, so a long wait never looks frozen. */
.video-sheet__bars {
  display: flex;
  align-items: flex-end;
  gap: 4px;
  height: 22px;
}
.video-sheet__bars i {
  width: 4px;
  border-radius: 2px;
  background: rgb(var(--v-theme-primary));
  animation: video-sheet-bar 1s ease-in-out infinite;
}
.video-sheet__bars i:nth-child(2) { animation-delay: 0.15s; }
.video-sheet__bars i:nth-child(3) { animation-delay: 0.3s; }
.video-sheet__bars i:nth-child(4) { animation-delay: 0.45s; }
.video-sheet__bars i:nth-child(5) { animation-delay: 0.6s; }
@keyframes video-sheet-bar {
  0%,
  100% {
    height: 5px;
  }
  50% {
    height: 22px;
  }
}

.video-sheet__close {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 3;
  color: #fff;
  background: rgba(0, 0, 0, 0.5);
}

.video-sheet__info {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px 20px 20px;
}
.video-sheet__text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.video-sheet__title {
  margin: 0;
  font-size: 17px;
  font-weight: 650;
  line-height: 1.3;
}
.video-sheet__meta {
  font-size: 13px;
  color: rgba(var(--v-theme-on-surface), 0.64);
}
.video-sheet__langs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  flex-shrink: 0;
}
.video-sheet__lang {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px 6px 7px;
  border: 0;
  border-radius: 999px;
  background: rgba(var(--v-theme-on-surface), 0.07);
  color: rgb(var(--v-theme-on-surface));
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  transition: background 0.2s ease;
}
.video-sheet__lang:hover {
  background: rgba(var(--v-theme-primary), 0.16);
}
.video-sheet__lang[aria-pressed="true"] {
  background: rgba(var(--v-theme-primary), 0.2);
  color: rgb(var(--v-theme-primary));
}
.video-sheet__lang--static {
  cursor: default;
  flex-shrink: 0;
}

.video-sheet-fade-enter-active,
.video-sheet-fade-leave-active {
  transition: opacity 0.3s ease;
}
.video-sheet-fade-enter-from,
.video-sheet-fade-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .video-sheet__bars i {
    animation: none;
    height: 12px;
  }
}
</style>
