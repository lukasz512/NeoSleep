<!-- Case 02 · Grupo Planeta as an accordion of big tabs (Łukasz, 2026-09-29: back to the earlier
     spread: large tabs on the left, photos on the right, moving slowly, ~1.5 scrolls per event).
     Each launch is a chapter at least 150svh tall: its tab (Bodoni year + title) stays pinned on
     the left while its photos drift up on the right more slowly than the page; the next chapter's
     tab then slides over and the previous one folds away. Photos open full screen. Only originals
     ≥1600 px are shown large (content/planeta.ts). Phones: tab above its photos, no pinning. -->
<template>
  <article id="planeta" ref="root" class="case" :class="{ 'is-in': seen }">
    <header class="case__head">
      <p class="eyebrow">{{ t("planeta.number") }} · {{ t("planeta.client") }}</p>
      <h3 class="case__title">
        <span class="mask-line"><span><AccentText :text="t('planeta.title')" :stroke="1" /></span></span>
      </h3>
      <p class="case__tags">{{ t("planeta.tags") }} · {{ t("planeta.city") }}</p>
      <p class="case__body">{{ t("planeta.body") }}</p>
    </header>

    <section
      v-for="(ev, i) in events"
      :key="ev.id"
      :ref="(el) => (chapters[i] = el as HTMLElement | null)"
      class="ch"
      :class="{ on: i === active, past: i < active, pair: ev.photos.length === 2 }"
      :data-index="i"
    >
      <div class="ch__tab">
        <span class="ch__year">{{ ev.year ?? "—" }}</span>
        <h4 class="ch__title">{{ ev.title }}</h4>
        <p class="ch__meta">
          {{ t(`planeta.events.${ev.id}`) }} · {{ t("planeta.photoCount", { n: ev.photos.length }) }}
        </p>
      </div>
      <div class="ch__photos">
        <button
          v-for="(p, j) in ev.photos"
          :key="p"
          v-parallax="j % 2 ? -0.05 : 0.04"
          type="button"
          class="ch__photo"
          :class="`ch__photo--${j % 3}`"
          :aria-label="t('media.enlarge')"
          @click="open(i, j)"
        >
          <picture>
            <source :srcset="picture(photoBase(p, j === 0)).avif" type="image/avif" />
            <img
              :src="picture(photoBase(p, j === 0)).jpg"
              :alt="t('planeta.photoAlt', { event: ev.title })"
              loading="lazy"
              decoding="async"
            />
          </picture>
        </button>
      </div>
    </section>
    <PhotoLightbox v-model:index="viewing" :photos="lightboxPhotos" :labels="lbLabels" />
  </article>
</template>

<script setup lang="ts">
import AccentText from "./AccentText.vue";
import PhotoLightbox, { type LightboxPhoto } from "./PhotoLightbox.vue";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { PLANETA_VISIBLE, photoBase, type PlanetaEvent } from "../content/planeta";
import { picture } from "../lib/media";
import { useInView } from "../lib/useInView";
import { vParallax } from "../lib/motion";

const { t } = useI18n();
const root = ref<HTMLElement | null>(null);
const seen = useInView(root, "-10%");
const events = PLANETA_VISIBLE;
const active = ref(0);
const chapters = ref<(HTMLElement | null)[]>([]);

// The chapter holding the middle of the screen is the open tab.
let io: IntersectionObserver | null = null;
onMounted(() => {
  if (typeof IntersectionObserver === "undefined") return;
  io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) if (e.isIntersecting) active.value = Number((e.target as HTMLElement).dataset.index);
    },
    { rootMargin: "-50% 0px -50% 0px" },
  );
  chapters.value.forEach((c) => c && io?.observe(c));
});
onBeforeUnmount(() => io?.disconnect());

// Full-screen viewer: the chosen launch's photos, largest file available, with a one-line description.
const viewing = ref<number | null>(null);
const viewingEvent = ref(0);
function open(i: number, j: number) {
  viewingEvent.value = i;
  viewing.value = j;
}
const lightboxPhotos = computed<LightboxPhoto[]>(() => {
  const ev: PlanetaEvent = events[viewingEvent.value] ?? events[0]!;
  const caption = [t(`planeta.events.${ev.id}`), ev.year, t("planeta.client"), t("planeta.city")].filter(Boolean).join(" · ");
  return ev.photos.map((p) => ({ src: picture(photoBase(p, true)), title: ev.title, caption }));
});
const lbLabels = computed(() => ({ prev: t("media.prev"), next: t("media.next"), close: t("media.close") }));
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
  margin: 0 0 20px;
  color: var(--ajm-muted);
  font-size: 14px;
  letter-spacing: 0.04em;
}
.case__body {
  margin: 0;
  max-width: 620px;
  font-size: clamp(17px, 1.5vw, 21px);
  color: var(--ajm-ink-soft);
}

/* one launch = one chapter, at least 1.5 screens tall */
.ch {
  display: grid;
  grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
  gap: clamp(24px, 5vw, 80px);
  min-height: 150svh;
  border-top: 1px solid var(--ajm-line);
  padding: clamp(32px, 5vh, 64px) 0;
}
.ch__tab {
  position: sticky;
  top: 18vh;
  align-self: start;
  display: grid;
  gap: 10px;
  transition:
    opacity 0.7s ease,
    transform 0.9s var(--ajm-ease);
}
.ch:not(.on) .ch__tab {
  opacity: 0.28;
}
.ch.past .ch__tab {
  transform: translateY(-12px) scale(0.97);
  transform-origin: 0 0;
}
.ch__year {
  font: italic 400 clamp(64px, 9vw, 150px) / 0.9 var(--ajm-display);
  letter-spacing: -0.04em;
  color: var(--ajm-ink);
}
.ch__title {
  margin: 0;
  font: 500 clamp(30px, 3.6vw, 60px) / 1.02 var(--ajm-font);
  letter-spacing: -0.02em;
}
.ch__meta {
  margin: 0;
  font-size: 14px;
  color: var(--ajm-muted);
}

/* photos: a lead frame, then pairs; they drift at a different pace from the page (v-parallax) */
.ch__photos {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: clamp(10px, 1.4vw, 20px);
  align-content: start;
  padding-top: clamp(0px, 8vh, 96px);
}
.ch__photo {
  display: block;
  padding: 0;
  border: 0;
  background: var(--ajm-line);
  overflow: hidden;
  cursor: zoom-in;
  transform: translate3d(0, var(--py, 0), 0);
  aspect-ratio: 4 / 5;
}
.ch__photo:first-child {
  grid-column: 1 / -1;
  aspect-ratio: 4 / 3;
}
.ch__photo--2:not(:first-child) {
  margin-top: clamp(24px, 6vh, 72px);
}
.ch__photo picture,
.ch__photo img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.ch__photo img {
  transition: transform 1s var(--ajm-ease);
}
.ch__photo:hover img {
  transform: scale(1.04);
}
.ch__photo:focus-visible {
  outline: 2px solid var(--ajm-ink);
  outline-offset: 3px;
}
/* two photos only: side by side, same size, under the tab's line */
.ch.pair .ch__photo:first-child {
  grid-column: auto;
  aspect-ratio: 4 / 5;
}

@media (max-width: 860px) {
  .ch {
    grid-template-columns: 1fr;
    min-height: 0;
  }
  .ch__tab {
    position: static;
  }
  .ch:not(.on) .ch__tab {
    opacity: 1;
  }
  .ch.past .ch__tab {
    transform: none;
  }
  .ch__year {
    font-size: 56px;
  }
  .ch__photos {
    padding-top: 0;
  }
}
</style>
