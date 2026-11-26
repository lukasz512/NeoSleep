<!-- Case 03 · Privalia: continuity, so the case is a timeline. A huge year stays pinned on the left and
     rolls like an odometer (only the digits that change move) as each chapter crosses the middle of the
     screen: 2019 venue → 2020 live broadcast → live shopping. Each chapter has its own footage; 2019 adds
     the eFashion Day photographs as a drifting mosaic. -->
<template>
  <article id="privalia" ref="root" class="case" :class="{ 'is-in': seen }">
    <header class="case__head">
      <p class="eyebrow">{{ t("privalia.number") }} · {{ t("privalia.client") }}</p>
      <h3 class="case__title">
        <span class="mask-line"><span><AccentText :text="t('privalia.title')" :stroke="2" /></span></span>
      </h3>
      <p class="case__tags">{{ t("privalia.tags") }}</p>
      <p v-reveal class="case__body">{{ t("privalia.body") }}</p>
    </header>

    <div class="tl">
      <div class="tl__rail" aria-hidden="true">
        <div class="tl__year">
          <span v-for="(ch, i) in mark" :key="i" class="tl__slot">
            <Transition name="roll">
              <span :key="ch" class="tl__ch" :style="{ transitionDelay: `${i * 60}ms` }">{{ ch }}</span>
            </Transition>
          </span>
        </div>
        <div class="tl__progress"><i :style="{ transform: `scaleY(${(active + 1) / chapters.length})` }" /></div>
      </div>

      <div class="tl__chapters">
        <section
          v-for="(ch, i) in chapters"
          :key="ch.id"
          :ref="(el) => (chapterEls[i] = el as HTMLElement | null)"
          class="chapter"
          :class="{ on: active === i, 'chapter--text': !ch.loop }"
          :data-index="i"
        >
          <h4 v-reveal class="chapter__name">{{ t(`privalia.chapters.${ch.id}.name`) }}</h4>
          <p v-reveal="{ delay: 80 }" class="chapter__body">{{ t(`privalia.chapters.${ch.id}.body`) }}</p>

          <div v-if="ch.loop && ch.poster" v-reveal="'wipe'" class="chapter__film">
            <LoopVideo
              :src="loopUrl(ch.loop, lite)"
              :poster="picture(ch.poster)"
              :label="t(`privalia.chapters.${ch.id}.name`)"
              :play-label="t('media.play')"
              :lite="lite"
            />
          </div>

          <div v-if="ch.photos" class="mosaic" :class="{ 'mosaic--single': ch.photos.length === 1, 'mosaic--pair': ch.photos.length === 2, 'mosaic--portrait': ch.portrait }">
            <button
              v-for="(p, j) in ch.photos"
              :key="p.id"
              v-reveal="{ variant: 'scale', delay: (j % 3) * 90 }"
              v-parallax="j % 2 ? 0.06 : -0.04"
              type="button"
              class="mosaic__item"
              :class="`mosaic__item--${j}`"
              :aria-label="t('media.enlarge')"
              @click="openPhoto(ch.id, j)"
            >
              <picture>
                <source :srcset="picture(photoSrc(p)).avif" type="image/avif" />
                <img :src="picture(photoSrc(p)).jpg" :alt="altFor(ch.id)" loading="lazy" decoding="async" />
              </picture>
            </button>
          </div>
        </section>
      </div>
    </div>
    <PhotoLightbox v-model:index="viewing" :photos="lightboxPhotos" :labels="lbLabels" />
  </article>
</template>

<script setup lang="ts">
import AccentText from "./AccentText.vue";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import LoopVideo from "./LoopVideo.vue";
import PhotoLightbox, { type LightboxPhoto } from "./PhotoLightbox.vue";
import { PRIVALIA_VISIBLE } from "../content/cases";
import { loopUrl, picture } from "../lib/media";
import { useInView } from "../lib/useInView";
import { vParallax, vReveal } from "../lib/motion";

defineProps<{ lite: boolean }>();
const { t } = useI18n();
const root = ref<HTMLElement | null>(null);
const seen = useInView(root, "-10%");

const chapters = PRIVALIA_VISIBLE;
const active = ref(0);
const mark = computed(() => t(`privalia.chapters.${chapters[active.value]?.id ?? "y2019"}.mark`).split(""));
const chapterEls = ref<(HTMLElement | null)[]>([]);

function photoSrc(p: { id: string; large: boolean }): string {
  return `privalia/${p.id}-${p.large ? 1280 : 640}`;
}
function altFor(id: string): string {
  if (id === "y2020") return t("privalia.photoAlt2020");
  if (id === "beauty") return t("privalia.photoAltBeauty");
  return t("privalia.photoAlt");
}

// Photos open full screen with the chapter's name and year as the description.
const viewing = ref<number | null>(null);
const viewingChapter = ref<string>(chapters[0]?.id ?? "y2019");
function openPhoto(id: string, j: number) {
  viewingChapter.value = id;
  viewing.value = j;
}
const lightboxPhotos = computed<LightboxPhoto[]>(() => {
  const ch = chapters.find((c) => c.id === viewingChapter.value);
  if (!ch?.photos) return [];
  const title = t(`privalia.chapters.${ch.id}.name`);
  const caption = [t(`privalia.chapters.${ch.id}.mark`), t("privalia.client")].join(" · ");
  return ch.photos.map((p) => ({ src: picture(photoSrc(p)), title, caption }));
});
const lbLabels = computed(() => ({ prev: t("media.prev"), next: t("media.next"), close: t("media.close") }));

// The chapter crossing the middle band of the screen drives the year.
let io: IntersectionObserver | null = null;
onMounted(() => {
  if (typeof IntersectionObserver === "undefined") return;
  io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) active.value = Number((e.target as HTMLElement).dataset.index);
      }
    },
    { rootMargin: "-40% 0px -40% 0px" },
  );
  chapterEls.value.forEach((el) => el && io?.observe(el));
});
onBeforeUnmount(() => io?.disconnect());
</script>

<style scoped>
.case {
  padding: clamp(72px, 10vw, 140px) var(--ajm-gutter);
  border-top: 1px solid var(--ajm-line);
}
.case__head {
  max-width: 900px;
  margin-bottom: clamp(40px, 6vw, 80px);
}
.case__title {
  margin: 0.35em 0 0.5em;
  font: 500 clamp(32px, 5vw, 72px) / 1 var(--ajm-font);
  letter-spacing: -0.02em;
}
.case__tags {
  margin: 0 0 20px;
  color: var(--ajm-muted);
  font-size: 14px;
  letter-spacing: 0.04em;
}
.case__body {
  margin: 0;
  max-width: 640px;
  font-size: clamp(17px, 1.5vw, 21px);
  color: var(--ajm-ink-soft);
}

.tl {
  display: grid;
  grid-template-columns: minmax(0, 4fr) minmax(0, 8fr);
  gap: clamp(24px, 5vw, 80px);
}
.tl__rail {
  position: sticky;
  top: 18vh;
  align-self: start;
  display: flex;
  gap: 20px;
  align-items: stretch;
}
.tl__year {
  display: flex;
  /* sized to fit its column: at 12vw "2020" was wider than the rail and got cut */
  font: italic 400 clamp(60px, 9vw, 150px) / 1 var(--ajm-display);
  letter-spacing: -0.05em;
  font-variant-numeric: tabular-nums;
}
/* each digit rolls inside its own window; the window is wider and taller than the digit so the
   italic's overhang and the ball terminals are never cut (Łukasz: show them whole) */
.tl__slot {
  position: relative;
  display: inline-block;
  overflow: hidden;
  height: 1.12em;
  padding: 0.04em 0.16em 0 0.02em;
  margin-right: -0.16em;
  min-width: 0.3em;
}
.tl__ch {
  display: inline-block;
}
.roll-enter-active,
.roll-leave-active {
  transition: transform 0.7s var(--ajm-ease), opacity 0.7s ease;
}
.roll-leave-active {
  position: absolute;
  left: 0;
  top: 0;
}
.roll-enter-from {
  transform: translateY(100%);
  opacity: 0;
}
.roll-leave-to {
  transform: translateY(-100%);
  opacity: 0;
}
.tl__progress {
  width: 1px;
  background: var(--ajm-line);
  position: relative;
}
.tl__progress i {
  position: absolute;
  inset: 0;
  background: var(--ajm-ink);
  transform-origin: top;
  transition: transform 0.8s var(--ajm-ease);
}

.tl__chapters {
  display: grid;
  gap: clamp(96px, 14vw, 180px);
}
.chapter {
  min-height: 70svh;
  transition: opacity 0.5s ease;
}
.chapter:not(.on) {
  opacity: 0.45;
}
.chapter__name {
  margin: 0 0 12px;
  font: 500 clamp(28px, 3.4vw, 52px) / 1.05 var(--ajm-font);
  letter-spacing: -0.02em;
}
.chapter__body {
  margin: 0 0 32px;
  max-width: 560px;
  font-size: 17px;
  color: var(--ajm-ink-soft);
}
.chapter--text {
  min-height: 40svh;
}
.chapter--text .chapter__name {
  font-size: clamp(36px, 5vw, 80px);
}
.chapter__film {
  aspect-ratio: 16 / 9;
  overflow: hidden;
}
.chapter__film :deep(.loop),
.chapter__film :deep(img),
.chapter__film :deep(video) {
  height: 100%;
}

/* editorial mosaic: one wide lead, a tall portrait, then smaller frames at different heights */
.mosaic {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: clamp(8px, 1.2vw, 16px);
  margin-top: clamp(16px, 2vw, 28px);
}
.mosaic__item {
  display: block;
  padding: 0;
  border: 0;
  background: none;
  overflow: hidden;
  cursor: zoom-in;
  transform: translate3d(0, var(--py, 0), 0);
}
.mosaic__item picture {
  display: block;
  height: 100%;
}
.mosaic__item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.8s var(--ajm-ease);
}
.mosaic__item:hover img {
  transform: scale(1.04);
}
.mosaic__item--0 {
  grid-column: 1 / 5;
  aspect-ratio: 3 / 2;
}
.mosaic__item--1 {
  grid-column: 5 / 7;
  grid-row: span 2;
  aspect-ratio: 3 / 4;
  align-self: start;
}
.mosaic__item--2 {
  grid-column: 1 / 3;
  aspect-ratio: 3 / 2;
}
.mosaic__item--3 {
  grid-column: 3 / 5;
  aspect-ratio: 3 / 2;
}
/* two photos: side by side, same size */
.mosaic--pair .mosaic__item--0,
.mosaic--pair .mosaic__item--1 {
  grid-column: span 3;
  grid-row: auto;
  aspect-ratio: 3 / 2;
}
/* the seventh photo closes the spread as a wide band (the courtyard seen from above) */
.mosaic__item--6 {
  grid-column: 1 / 7;
  aspect-ratio: 21 / 9;
}
/* a chapter with one photo shows it as a portrait, not cropped to the lead's landscape */
.mosaic--single .mosaic__item--0 {
  grid-column: 1 / 4;
  aspect-ratio: 3 / 4;
}
/* reel stills (vertical): three portraits a row, the middle one set lower like a contact sheet */
.mosaic--portrait .mosaic__item {
  grid-column: span 2;
  grid-row: auto;
  aspect-ratio: 4 / 5;
  margin-top: 0;
}
.mosaic--portrait .mosaic__item:nth-child(3n + 2) {
  margin-top: clamp(16px, 3vw, 48px);
}
.mosaic__item--4 {
  grid-column: 1 / 4;
  aspect-ratio: 4 / 3;
  margin-top: clamp(16px, 3vw, 48px);
}
.mosaic__item--5 {
  grid-column: 4 / 7;
  aspect-ratio: 4 / 3;
  margin-top: clamp(16px, 3vw, 48px);
}

@media (max-width: 860px) {
  .tl {
    grid-template-columns: 1fr;
  }
  .tl__rail {
    top: var(--head-offset, 56px);
    transition: top 0.5s var(--ajm-ease);
    z-index: 2;
    background: var(--ajm-paper);
    padding: 8px 0;
  }
  .tl__year {
    font-size: 56px;
  }
  .tl__progress {
    display: none;
  }
  .chapter {
    min-height: 0;
  }
}
</style>
