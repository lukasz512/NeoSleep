<template>
  <div
    class="video-card"
    :class="{ 'video-card--pressing': pressing, 'video-card--row': layout === 'row', 'video-card--done': status === 'completed' }"
    :data-status="status"
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
      <span class="video-card__status" :class="`video-card__status--${status}`" data-testid="video-status">{{ statusLabel }}</span>
      <span v-if="video.durationSec" class="video-card__duration">{{ formatDuration(video.durationSec) }}</span>
      <span class="video-card__drop" aria-hidden="true"><AppIcon name="play" /></span>
      <span v-if="status !== 'not_started'" class="video-card__progress" aria-hidden="true"><i :style="{ width: `${percent}%` }" /></span>
    </div>
    <span class="video-card__body">
      <span class="video-card__title-row">
        <span class="video-card__title">{{ video.title }}</span>
        <VMenu location="bottom end">
          <template #activator="{ props: menuProps }">
            <button
              v-bind="menuProps"
              type="button"
              class="video-card__menu"
              data-testid="video-menu"
              :title="t('user.resources.menu.label')"
              :aria-label="t('user.resources.menu.label')"
              @click.stop
              @keydown.enter.stop
              @keydown.space.stop
            >
              <AppIcon name="dots-vertical" />
            </button>
          </template>
          <VList density="compact" class="video-card__menu-list">
            <VListItem
              v-if="status === 'completed'"
              data-testid="video-mark-not_started"
              :title="t('user.resources.menu.markUnwatched')"
              @click="markStatus(video.id, 'not_started')"
            />
            <VListItem
              v-else
              data-testid="video-mark-completed"
              :title="t('user.resources.menu.markWatched')"
              @click="markStatus(video.id, 'completed')"
            />
          </VList>
        </VMenu>
      </span>
      <span v-if="statusLine" class="video-card__status-line" :class="`video-card__status-line--${status}`">{{ statusLine }}</span>
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
import { ref, watch, computed } from "vue";
import { useI18n } from "vue-i18n";
import AppIcon from "../AppIcon.vue";
import PartnerLanguageFlag from "./PartnerLanguageFlag.vue";
import { formatDuration, languageName } from "./videoFormat";
import type { PartnerResourceItem } from "../../composables/usePartnerResources";
import { useResourceProgress, statusOf } from "../../composables/useResourceProgress";
import "./resourceCards.css";

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

/**
 * Watch status (NEO-209): a badge on the frame, a thin bar under it for how
 * far, and one line under the title (where to continue / when watched).
 * Watched tiles dim a little so the unseen ones stand out. The ⋯ menu marks
 * by hand (D4) without opening the video.
 */
const { progress, markStatus } = useResourceProgress();
const row = computed(() => progress[props.video.id]);
const status = computed(() => statusOf(progress, props.video.id));
const percent = computed(() => row.value?.percent ?? 0);
const statusLabel = computed(() =>
  status.value === "in_progress" ? t("user.resources.status.in_progress", { percent: percent.value }) : t(`user.resources.status.${status.value}`)
);
const statusLine = computed(() => {
  if (status.value === "in_progress" && row.value) return t("user.resources.status.continueFrom", { time: formatDuration(row.value.positionSec) });
  if (status.value === "completed" && row.value?.completedAt) {
    const date = new Date(row.value.completedAt).toLocaleDateString(locale.value, { day: "numeric", month: "short" });
    return t("user.resources.status.watchedOn", { date });
  }
  return "";
});

const pressing = ref(false);
function open(): void {
  pressing.value = false;
  requestAnimationFrame(() => (pressing.value = true));
  emit("open");
}
</script>
